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

	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/contextstore"
	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/node"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
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

	// service is the local Node application boundary: the rpc service
	// implementations and application operations.
	service *node.Service
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
				WorkspaceID: workspaceID, OrganizationID: node.PROrgID(registry, workspaceID), PRID: fmt.Sprintf("%d", pr.Number),
				Title: node.OptionalString(pr.Title), URL: node.OptionalString(pr.URL), Branch: node.OptionalString(pr.Branch),
				BaseBranch: node.OptionalString(pr.BaseBranch), State: node.PersistedPullRequestState(pr),
				Metadata: node.OptionalString(node.MarshalPRMetadata(pr)), DetectedAt: node.PersistedPullRequestDetectedAt(pr),
				ResolvedAt: node.PersistedPullRequestResolvedAt(pr),
			})
		},
		ResolvePR: func(ctx context.Context, workspaceID string, prNumber int) error {
			return store.ResolvePR(ctx, workspaceID, fmt.Sprintf("%d", prNumber))
		},
		OnPullRequestUpdated: func(event workspaceprtracker.PullRequestUpdatedEvent) {
			node.PublishWorkspacePullRequestUpdatedEvent(events, event)
		},
	})
	watchers := node.NewWatchers(events, prTracker.RefreshWorkspaceByPath)
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
	piAuth := node.NewManagedPiAuthStore()
	contextStore := contextstore.NewStore(cfg.SettingsPath)
	memorySvc := initMemoryService(cfg.DataDir, cfg.MemorySummarizer)

	service := node.NewService(node.Dependencies{
		Registry:          registry,
		Store:             store,
		Files:             filesService,
		Git:               gitService,
		Terminals:         terminals,
		Memory:            memorySvc,
		Computer:          computerSvc,
		ModelList:         modelList,
		AgentMgr:          agentMgr,
		PIAuth:            piAuth,
		TokenUsage:        tokenUsage,
		Events:            events,
		Watchers:          watchers,
		PRTracker:         prTracker,
		CleanupStore:      cleanupStore,
		ContextStore:      contextStore,
		Database:          cfg.Database,
		Runtime:           cfg.Runtime,
		NodeID:            cfg.NodeID,
		LogFilePath:       cfg.LogFilePath,
		SettingsPath:      cfg.SettingsPath,
		AgentLifecycleCtx:    agentLifecycleCtx,
		AgentLifecycleCancel: cancelAgentLifecycle,
		ServerCtx:            context.Background(),
	})

	app := &App{
		registry:     registry,
		store:        store,
		files:        filesService,
		git:          gitService,
		terminals:    terminals,
		memory:       memorySvc,
		computer:     computerSvc,
		modelList:    modelList,
		agentMgr:     agentMgr,
		piAuth:       piAuth,
		tokenUsage:   tokenUsage,
		events:       events,
		watchers:     watchers,
		prTracker:    prTracker,
		cleanupStore: cleanupStore,
		contextStore: contextStore,
		database:     cfg.Database,
		Runtime:      cfg.Runtime,
		NodeID:       cfg.NodeID,
		logFilePath:  cfg.LogFilePath,
		settingsPath: cfg.SettingsPath,
		serverCtx:             context.Background(),
		agentLifecycleCtx:     agentLifecycleCtx,
		cancelAgentLifecycle:  cancelAgentLifecycle,
		cleanupCtx:            cleanupCtx,
		cancelCleanup:         cancelCleanup,
		service:               service,
	}

	// Computer feature config comes from settings.yaml.
	if err := app.applyComputerSettings(); err != nil {
		return nil, err
	}

	// Restore persisted workspaces and register a filesystem watcher for every
	// active one (see WatchActiveWorkspaces for why hydration is not enough).
	if err := service.HydrateFromDB(context.Background()); err != nil {
		return nil, fmt.Errorf("restore persisted workspaces: %w", err)
	}
	service.WatchActiveWorkspaces()

	// Background tasks (and the lifecycle contexts that bound them).
	app.Start()

	// Build the rpc service layer and the transport server, then the relay
	// client (it needs the rpc server and the service as its message handler).
	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{
		Registry:  registry,
		Files:     filesService,
		Git:       gitService,
		Terminals: terminals,
	})
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
	app.router = buildNamespaceRouter(service, workspaceSvc, projectSvc, systemSvc)
	app.rpcServer = rpc.NewServer(service)
	app.rpcServer.BinaryFrameHandler = service
	app.relay = relay.NewClient(relay.ClientConfig{
		Runtime:     cfg.Runtime,
		NodeID:      cfg.NodeID,
		URL:         cfg.RelayURL,
		StaticToken: cfg.RelayToken,
		Server:      app.rpcServer,
		Handler:     service,
		Events:      events,
	})
	service.SetRelayClient(app.relay)

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
	if a.service != nil {
		a.service.Shutdown()
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
	a.service.ServeAgentHook(w, r)
}

// NewRouter builds the namespace routing table for the node services (test
// and composition helper; Bootstrap wires it into the app).
func NewRouter(service *node.Service, workspaceSvc *nodeworkspace.Service, projectSvc *nodeproject.Service, systemSvc *nodesystem.Service) *rpc.Router {
	return buildNamespaceRouter(service, workspaceSvc, projectSvc, systemSvc)
}
