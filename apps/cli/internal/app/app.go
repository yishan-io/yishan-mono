// Package app is the CLI daemon's composition root: it owns dependency
// composition, startup, and shutdown. app.App builds the full account-scoped
// service graph (registry, stores, capabilities, domain owners, the local
// node.Service, the rpc transport layer, and the relay client) and owns the
// background tasks and the shutdown order. It contains no application
// operations — those live in node.Service and the domain owners.
package app

import (
	"context"
	"net/http"

	"database/sql"
	"fmt"
	"path/filepath"

	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/memory"
	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/node/context"
	"yishan/apps/cli/internal/node/hook"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"

	"github.com/rs/zerolog/log"
)

// Config carries the daemon-side inputs Bootstrap needs to build the service
// graph. The database, runtime, and paths are resolved by the daemon process
// layer (account-scoped); Bootstrap composes the services around them.
type Config struct {
	Runtime     *cliruntime.Runtime
	NodeID      string
	LogFilePath string
	Database    *sql.DB
	// EnvDir is the profile (env root) directory: the token-usage pricing
	// cache stays machine/runtime-level and does not move with the account.
	EnvDir string
	// DataDir is the per-account data dir: settings, memory, and the local
	// database live here.
	DataDir      string
	SettingsPath string

	MemorySummarizer memory.SummarizerConfig

	// TokenUsage overrides the default token-usage collector. Tests inject a
	// fake to record startup/shutdown calls. Nil builds the default collector.
	TokenUsage tokenusage.Service

	// Relay configures the relay client (connection state owned by
	// internal/relay). Empty URL disables it.
	RelayEnabled bool
	RelayURL     string
	RelayToken   string
}

// App is the daemon's composition root. It owns the composed service graph,
// the background tasks (Start), and the shutdown order (Close). Application
// operations live in node.Service; App only composes and coordinates
// lifecycle.
type App struct {
	registry  *instance.Registry
	store     workspace.WorkspaceStore
	files     *files.FileService
	git       *git.GitService
	terminals *terminal.Manager

	memory       *memory.Service
	computer     *computer.Service
	modelList    *modellist.Service
	agentMgr     *agentmanager.Manager
	piAuth       *piauth.Store
	tokenUsage   tokenusage.Service
	events       *internalevents.Hub
	watchers     *workspacewatchers.Watchers
	prTracker    *workspaceprtracker.Tracker
	cleanupStore *localdb.WorkspaceCleanupStore
	contextStore *contextstore.Store
	database     *sql.DB
	Runtime      *cliruntime.Runtime
	NodeID       string
	logFilePath  string
	settingsPath string

	// agentLifecycleCtx bounds pi agent process lifetimes; Close cancels it
	// before stopping the agent manager.
	agentLifecycleCtx context.Context
	// serverCtx is the long-lived context RPC handlers use for server-side
	// work (memory searches, relayed creates).
	serverCtx context.Context

	// agentSvc is the agent application service (pi sessions, task runs).
	agentSvc *nodeagent.Service
	// workspaceSvc is the workspace application service (lifecycle, relay).
	workspaceSvc *nodeworkspace.Service
	// hookIngress handles the agent hook HTTP ingress (pi notify bridge).
	hookIngress *hook.Ingress
	// router is the namespace routing table.
	router *rpc.Router
	// rpcServer is the JSON-RPC/WebSocket transport server.
	rpcServer *rpc.Server
	// relay is the relay client (connection state owned by internal/relay).
	relay *relay.Client

	cleanupCtx           context.Context
	cancelCleanup        context.CancelFunc
	cancelAgentLifecycle context.CancelFunc
	fileCacheSubID       uint64
}

// Bootstrap composes the daemon's service graph for one account. It mirrors
// the historical daemon startup order: workspace store → cleanup store →
// context store → token usage → computer (+ settings) → memory → hydrate →
// watch → background tasks → rpc layer.
func Bootstrap(cfg Config) (*App, error) {
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
	store := localdb.NewStore(localdb.NewWorkspaceStore(cfg.Database))
	gitService := git.NewGitService()
	terminals := terminal.NewManager()

	legacyCleanupPath := filepath.Join(cfg.DataDir, localdb.PendingCleanupFileName)
	cleanupStore, err := localdb.NewWorkspaceCleanupStore(cfg.Database, legacyCleanupPath)
	if err != nil {
		return nil, fmt.Errorf("create workspace cleanup store: %w", err)
	}

	events := internalevents.NewHub()
	prTracker := workspaceprtracker.New(workspaceprtracker.TrackerDeps{
		Instances: registry,
		Gits:      gitService,
		Runtime:   cfg.Runtime,
		PersistPR: func(ctx context.Context, workspaceID string, pr *workspace.WorkspacePullRequest) error {
			return store.UpsertPR(ctx, &workspace.StoredPullRequest{
				WorkspaceID: workspaceID, OrganizationID: nodeworkspace.PROrgID(registry, workspaceID), PRID: fmt.Sprintf("%d", pr.Number),
				Title: nodeworkspace.OptionalString(pr.Title), URL: nodeworkspace.OptionalString(pr.URL), Branch: nodeworkspace.OptionalString(pr.Branch),
				BaseBranch: nodeworkspace.OptionalString(pr.BaseBranch), State: nodeworkspace.PRState(pr),
				Metadata: nodeworkspace.OptionalString(nodeworkspace.MarshalPRMetadata(pr)), DetectedAt: nodeworkspace.PRDetectedAt(pr),
				ResolvedAt: nodeworkspace.PRResolvedAt(pr),
			})
		},
		ResolvePR: func(ctx context.Context, workspaceID string, prNumber int) error {
			return store.ResolvePR(ctx, workspaceID, fmt.Sprintf("%d", prNumber))
		},
		OnPullRequestUpdated: func(event workspaceprtracker.PullRequestUpdatedEvent) {
			nodeworkspace.PublishPullRequestUpdated(events, event)
		},
	})
	watchers := nodeworkspace.NewWatchers(events, prTracker.RefreshWorkspaceByPath)
	// Watcher and PR-tracker cleanup follows instance removal (close, rollback,
	// or same-path replacement in the registry).
	registry.SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})

	tokenUsage := cfg.TokenUsage
	if tokenUsage == nil {
		tokenUsage = tokenusage.NewCollectorWithRepository(
			registry,
			cfg.Runtime,
			localdb.NewHourlyUsageStore(cfg.Database),
			cfg.EnvDir,
		)
	}

	agentLifecycleCtx, cancelAgentLifecycle := context.WithCancel(context.Background())
	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())

	computerSvc := nodesystem.NewDefaultComputerService()
	modelList := modellist.NewService()
	agentMgr := agentmanager.NewManager()
	piAuth := nodeagent.NewManagedPiAuthStore()
	contextStore := contextstore.NewStore(cfg.SettingsPath)
	memorySvc := initMemoryService(cfg.DataDir, cfg.MemorySummarizer)

	usage := hook.NewUsageTracker()

	// Build the rpc service layer and the transport server, then the relay
	// client (it needs the rpc server and the service as its message handler).
	var agentSvc *nodeagent.Service
	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{
		Registry:     registry,
		Store:        store,
		Files:        filesService,
		Git:          gitService,
		Terminals:    terminals,
		Memory:       memorySvc,
		TokenUsage:   tokenUsage,
		Events:       events,
		Watchers:     watchers,
		PRTracker:    prTracker,
		CleanupStore: cleanupStore,
		Database:     cfg.Database,
		Runtime:      cfg.Runtime,
		NodeID:       cfg.NodeID,
		LogFilePath:  cfg.LogFilePath,
		ServerCtx:    context.Background(),
		CreateCompleted: func(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
			agentSvc.PublishWorkspaceCreateCompleted(plan, created, warnings)
		},
		Usage: usage,
	})
	agentSvc = nodeagent.NewService(nodeagent.Deps{
		Workspace:         workspaceSvc,
		AgentMgr:          agentMgr,
		PIAuth:            piAuth,
		ModelList:         modelList,
		Events:            events,
		Terminals:         terminals,
		ContextStore:      contextStore,
		AgentLifecycleCtx: agentLifecycleCtx,
		ServerCtx:         context.Background(),
		RelayCreateCompleted: func(prepared application.CreatePlan, completed map[string]any) {
			workspaceSvc.RelayCreateCompleted(prepared, completed)
		},
	})
	terminalSvc := nodeterminal.NewService(nodeterminal.Deps{
		Workspace: workspaceSvc,
		Terminals: terminals,
		Events:    events,
		Runtime:   cfg.Runtime,
		NodeID:    cfg.NodeID,
	})

	hookIngress := hook.NewIngress(hook.IngressDeps{
		Events:     events,
		TokenUsage: tokenUsage,
		Memory:     memorySvc,
		Registry:   registry,
		Usage:      usage,
	})

	app := &App{
		registry:             registry,
		store:                store,
		files:                filesService,
		git:                  gitService,
		terminals:            terminals,
		memory:               memorySvc,
		computer:             computerSvc,
		modelList:            modelList,
		agentMgr:             agentMgr,
		piAuth:               piAuth,
		tokenUsage:           tokenUsage,
		events:               events,
		watchers:             watchers,
		prTracker:            prTracker,
		cleanupStore:         cleanupStore,
		contextStore:         contextStore,
		database:             cfg.Database,
		Runtime:              cfg.Runtime,
		NodeID:               cfg.NodeID,
		logFilePath:          cfg.LogFilePath,
		settingsPath:         cfg.SettingsPath,
		serverCtx:            context.Background(),
		agentLifecycleCtx:    agentLifecycleCtx,
		cancelAgentLifecycle: cancelAgentLifecycle,
		cleanupCtx:           cleanupCtx,
		cancelCleanup:        cancelCleanup,
		agentSvc:             agentSvc,
		workspaceSvc:         workspaceSvc,
		hookIngress:          hookIngress,
	}

	// Computer feature config comes from settings.yaml.
	if err := app.applyComputerSettings(); err != nil {
		return nil, err
	}

	// Restore persisted workspaces and register a filesystem watcher for every
	// active one (see WatchActiveWorkspaces for why hydration is not enough).
	if err := workspaceSvc.Hydrate(context.Background()); err != nil {
		return nil, fmt.Errorf("restore persisted workspaces: %w", err)
	}
	workspaceSvc.WatchActive()

	// Background tasks (and the lifecycle contexts that bound them).
	app.Start()

	projectSvc := nodeproject.NewService(nodeproject.Deps{
		Runtime:  cfg.Runtime,
		Database: cfg.Database,
	})
	systemSvc := nodesystem.NewService(nodesystem.Deps{
		Runtime:      cfg.Runtime,
		Events:       events,
		ModelList:    modelList,
		TokenUsage:   tokenUsage,
		Memory:       memorySvc,
		Registry:     registry,
		Computer:     computerSvc,
		ContextStore: contextStore,
		SettingsPath: cfg.SettingsPath,
		ServerCtx:    context.Background(),
	})
	app.router = buildNamespaceRouter(agentSvc, workspaceSvc, terminalSvc, projectSvc, systemSvc)
	app.rpcServer = rpc.NewServer(appHandler{router: app.router, agent: agentSvc})
	app.rpcServer.BinaryFrameHandler = terminalSvc
	app.relay = relay.NewClient(relay.ClientConfig{
		Runtime:     cfg.Runtime,
		NodeID:      cfg.NodeID,
		URL:         cfg.RelayURL,
		StaticToken: cfg.RelayToken,
		Server:      app.rpcServer,
		Handler:     relayHandler{system: systemSvc, workspace: workspaceSvc, terminal: terminalSvc, runtime: cfg.Runtime},
		Events:      events,
	})
	terminalSvc.SetRelayClient(app.relay)
	workspaceSvc.SetRelayClient(app.relay)

	return app, nil
}

// Start creates the agent/cleanup lifecycle contexts and starts the
// background tasks owned by the app: file-cache consumer, token-usage startup
// scan, pending-cleanup retry, and the workspace health monitor.
func (a *App) Start() {
	a.StartFileCacheConsumer()
	if a.tokenUsage != nil {
		a.tokenUsage.StartStartupScan()
	}
	a.StartCleanupRetry()
	a.StartHealthMonitor()
}

// applyComputerSettings loads the computer-use feature config from
// settings.yaml. A missing/empty settings path leaves the defaults.
func (a *App) applyComputerSettings() error {
	if a.settingsPath == "" || a.computer == nil {
		return nil
	}
	cfg, err := config.LoadSettings(a.settingsPath, nil)
	if err != nil {
		return fmt.Errorf("load computer settings: %w", err)
	}
	a.computer.UpdateConfig(computer.FeatureConfig{
		Enabled:            cfg.ComputerUse.Enabled,
		Observe:            cfg.ComputerUse.Observe,
		Capture:            cfg.ComputerUse.Capture,
		Inspect:            cfg.ComputerUse.Inspect,
		Actions:            cfg.ComputerUse.Actions,
		Mouse:              cfg.ComputerUse.Mouse,
		Keyboard:           cfg.ComputerUse.Keyboard,
		ClipboardRead:      cfg.ComputerUse.ClipboardRead,
		ClipboardWrite:     cfg.ComputerUse.ClipboardWrite,
		ApplicationControl: cfg.ComputerUse.ApplicationControl,
	})
	return nil
}

// Close stops the service graph in the daemon's historical shutdown order:
// event hub subscription → PR tracker → token usage → memory → agent
// lifecycle → agent manager → model list shell → cleanup/health background
// tasks → local database.
func (a *App) Close() error {
	if a.events != nil {
		a.events.Unsubscribe(a.fileCacheSubID)
	}
	if a.prTracker != nil {
		a.prTracker.Stop()
	}
	if a.tokenUsage != nil {
		a.tokenUsage.Close()
	}
	if a.memory != nil {
		if err := a.memory.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close memory service")
		}
	}
	if a.agentSvc != nil {
		a.agentSvc.Shutdown()
	}
	modellist.ShutdownShell()
	if a.cancelCleanup != nil {
		a.cancelCleanup()
	}
	if a.database != nil {
		if err := a.database.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close local database")
		}
	}
	return nil
}

// RPCServer exposes the JSON-RPC/WebSocket transport server to the daemon
// process layer. The app owns composition and lifecycle; the daemon only
// serves.
func (a *App) RPCServer() *rpc.Server {
	return a.rpcServer
}

// Relay exposes the relay client (connection state owned by internal/relay).
func (a *App) Relay() *relay.Client {
	return a.relay
}

// ServeAgentHook handles the agent hook HTTP ingress (pi notify bridge).
func (a *App) ServeAgentHook(w http.ResponseWriter, r *http.Request) {
	a.hookIngress.ServeHTTP(w, r)
}

// NewRouter builds the namespace routing table for the node services (test
// and composition helper; Bootstrap wires it into the app).
func NewRouter(agentSvc *nodeagent.Service, workspaceSvc *nodeworkspace.Service, terminalSvc *nodeterminal.Service, projectSvc *nodeproject.Service, systemSvc *nodesystem.Service) *rpc.Router {
	return buildNamespaceRouter(agentSvc, workspaceSvc, terminalSvc, projectSvc, systemSvc)
}
