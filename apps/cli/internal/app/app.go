// Package app is the CLI daemon's composition root: it owns dependency
// composition, startup, and shutdown. app.App builds the full account-scoped
// service graph (registry, stores, capabilities, domain owners, the local
// node.Service, the rpc transport layer, and the relay client) and owns the
// background tasks and the shutdown order. It contains no application
// operations — those live in node.Service and the domain owners.
package app

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"path/filepath"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/adapter/sqlite"
	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	"yishan/apps/cli/internal/agent/dsh"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	localtask "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/memory"
	nodeagent "yishan/apps/cli/internal/node/agent"
	nodebackgroundjob "yishan/apps/cli/internal/node/backgroundjob"
	"yishan/apps/cli/internal/node/context"
	"yishan/apps/cli/internal/node/hook"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
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
	Session     *session.Session
	NodeID      string
	LogFilePath string
	// AgentStderr captures managed agent process stderr. It follows the active
	// daemon log writer when account-scoped logging is enabled.
	AgentStderr io.Writer
	// DaemonWSEndpoint is the loopback endpoint injected into managed children.
	DaemonWSEndpoint string
	Database         *sql.DB
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

	// DSHEnabled starts the experimental bundled DSH runtime supervisor. The
	// executable and runtime paths must be explicitly provided; no PATH lookup occurs.
	DSHEnabled       bool
	DSHDeveloperMode bool
	DSHNodePath      string
	DSHRuntimePath   string
	DSHDataDir       string
	DSHProvider      string
	DSHModel         string
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
	events       *eventbus.Hub
	watchers     *workspacewatchers.Watchers
	prTracker    *workspaceprtracker.Tracker
	cleanupStore *sqlite.WorkspaceCleanupStore
	contextStore *contextstore.Store
	database     *sql.DB
	Session      *session.Session
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
	// localTaskSvc is the local-only task application service.
	localTaskSvc *nodelocaltask.Service
	// hookIngress handles the agent hook HTTP ingress (pi notify bridge).
	hookIngress *hook.Ingress
	// router is the namespace routing table.
	router *rpc.Router
	// rpcServer is the JSON-RPC/WebSocket transport server.
	rpcServer *rpc.Server
	// relay is the relay client (connection state owned by internal/relay).
	relay *relay.Client
	// dsh supervises the experimental SDK JSON-RPC runtime when enabled.
	dsh *dsh.Supervisor
	// backgroundJobs owns daemon-only local DSH task execution.
	backgroundJobs backgroundJobRunner

	cleanupCtx                  context.Context
	cancelCleanup               context.CancelFunc
	backgroundJobRecoveryCtx    context.Context
	cancelBackgroundJobRecovery context.CancelFunc
	cancelAgentLifecycle        context.CancelFunc
	fileCacheSubID              uint64
}

// Bootstrap composes the daemon's service graph for one account. It mirrors
// the historical daemon startup order: workspace store → cleanup store →
// context store → token usage → computer (+ settings) → memory → hydrate →
// watch → background tasks → rpc layer.
func Bootstrap(cfg Config) (*App, error) {
	dshSupervisor := newDSHSupervisor(cfg)
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
	store := sqlite.NewStore(sqlite.NewWorkspaceStore(cfg.Database))
	gitService := git.NewGitService()
	terminals := terminal.NewManager()
	terminals.SetDaemonWSEndpoint(cfg.DaemonWSEndpoint)

	legacyCleanupPath := filepath.Join(cfg.DataDir, sqlite.PendingCleanupFileName)
	cleanupStore, err := sqlite.NewWorkspaceCleanupStore(cfg.Database, legacyCleanupPath)
	if err != nil {
		return nil, fmt.Errorf("create workspace cleanup store: %w", err)
	}

	events := eventbus.NewHub()
	prTracker := workspaceprtracker.New(workspaceprtracker.TrackerDeps{
		Instances: registry,
		Gits:      gitService,
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
			cfg.Session,
			sqlite.NewHourlyUsageStore(cfg.Database),
			cfg.EnvDir,
		)
	}

	agentLifecycleCtx, cancelAgentLifecycle := context.WithCancel(context.Background())
	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	backgroundJobRecoveryCtx, cancelBackgroundJobRecovery := context.WithCancel(context.Background())

	computerSvc := nodesystem.NewDefaultComputerService()
	modelList := modellist.NewService(dshSupervisor)
	agentMgr := agentmanager.NewManagerWithStderr(cfg.AgentStderr)
	piAuth := nodeagent.NewManagedPiAuthStore()
	contextStore := contextstore.NewStore(cfg.SettingsPath)
	templateStore := nodelocaltask.NewTemplateStore(cfg.DataDir)
	memorySvc := initMemoryService(cfg.DataDir, cfg.MemorySummarizer, cfg.DaemonWSEndpoint)

	usage := hook.NewUsageTracker()

	// Build the rpc service layer and the transport server, then the relay
	// client (it needs the rpc server and the service as its message handler).
	projectSvc := nodeproject.NewService(nodeproject.Deps{
		Session:  cfg.Session,
		Database: cfg.Database,
	})
	var localTaskSvc *nodelocaltask.Service
	localTaskSvc = nodelocaltask.NewService(nodelocaltask.Deps{
		Repository:      sqlite.NewLocalTaskStore(cfg.Database),
		Registry:        registry,
		WorkspaceStore:  store,
		ProjectResolver: projectSvc,
		Events:          events,
		TemplateStore:   templateStore,
		TaskContextsChanged: func() {
			refreshTaskContextRegistrations(context.Background(), memorySvc, localTaskSvc)
		},
		TaskTitleChanged: func(ctx context.Context, taskID string, taskTitle string) {
			refreshTaskContextTitle(ctx, memorySvc, localTaskSvc, taskID, taskTitle)
		},
		TaskDocumentChanged: func(_ context.Context, path string, workspaceRoot string, task localtask.Task) error {
			projectID := ""
			if task.ProjectID != nil {
				projectID = *task.ProjectID
			}
			return memorySvc.OnFileChanged(path, workspaceRoot, projectID)
		},
	})
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
		Session:      cfg.Session,
		NodeID:       cfg.NodeID,
		LogFilePath:  cfg.LogFilePath,
		ServerCtx:    context.Background(),
		CreateCompleted: func(plan application.CreatePlan, created workspace.Workspace, warnings []any) {
			agentSvc.PublishWorkspaceCreateCompleted(plan, created, warnings)
		},
		Usage: usage,
		WorkspaceAvailabilityChanged: func() {
			refreshTaskContextRegistrations(context.Background(), memorySvc, localTaskSvc)
		},
	})
	if dshSupervisor != nil {
		dshSupervisor.SetWorkspaceBindingResolver(func(_ context.Context, request dsh.WorkspaceBindingRequest) (dsh.WorkspaceBindingResult, error) {
			workspaceInstance, err := workspaceSvc.GetWorkspace(request.WorkspaceID)
			if err != nil {
				return dsh.WorkspaceBindingResult{}, err
			}
			if workspaceInstance.Path == "" || workspaceInstance.State != workspace.StateActive || workspaceInstance.Health != workspace.HealthOK {
				return dsh.WorkspaceBindingResult{}, fmt.Errorf("workspace is not active")
			}
			return dsh.WorkspaceBindingResult{
				WorkspaceID: workspaceInstance.ID,
				CWD:         workspaceInstance.Path,
				Policy:      dsh.WorkspaceBindingPolicy{Authorization: "daemon-authorized"},
			}, nil
		})
		dshSupervisor.SetCapabilityResolver(resolveDSHCapability(workspaceSvc, memorySvc, localTaskSvc))
	}
	var localPluginStore nodeagent.DSHLocalPluginStore
	if cfg.DSHDeveloperMode {
		localPluginStore, err = nodeagent.NewDSHLocalPluginStore(cfg.DSHDataDir, true)
		if err != nil {
			cancelAgentLifecycle()
			cancelCleanup()
			cancelBackgroundJobRecovery()
			return nil, fmt.Errorf("create DSH local plugin store: %w", err)
		}
	}
	agentSvc = nodeagent.NewService(nodeagent.Deps{
		Workspace:         workspaceSvc,
		DSH:               dshSessionsFor(dshSupervisor),
		DSHCredentials:    nodeagent.NewDSHCredentialStore(cfg.DSHDataDir),
		DSHPlugins:        nodeagent.NewDSHPluginManager(cfg.DSHDataDir),
		DSHPluginRuntime:  dshPluginRuntimeFor(dshSupervisor),
		DSHLocalPlugins:   localPluginStore,
		OwnerNodeID:       cfg.NodeID,
		DSHProvider:       cfg.DSHProvider,
		DSHModel:          cfg.DSHModel,
		AgentMgr:          agentMgr,
		PIAuth:            piAuth,
		ModelList:         modelList,
		Events:            events,
		Terminals:         terminals,
		ContextStore:      contextStore,
		AgentLifecycleCtx: agentLifecycleCtx,
		DaemonWSEndpoint:  cfg.DaemonWSEndpoint,
		ServerCtx:         context.Background(),
		RelayCreateCompleted: func(prepared application.CreatePlan, completed map[string]any) {
			workspaceSvc.RelayCreateCompleted(prepared, completed)
		},
	})
	workspaceSvc.SetAgentCleanupLifecycle(
		func(ctx context.Context, workspaceID string) (any, error) {
			return agentSvc.BeginWorkspaceAgentCleanup(ctx, workspaceID)
		},
		func(handle any) {
			cleanup, ok := handle.(*nodeagent.WorkspaceAgentCleanup)
			if ok {
				agentSvc.AbortWorkspaceAgentCleanup(cleanup)
			}
		},
		func(handle any) {
			cleanup, ok := handle.(*nodeagent.WorkspaceAgentCleanup)
			if ok {
				agentSvc.CommitWorkspaceAgentCleanup(cleanup)
			}
		},
	)
	backgroundJobs := newBackgroundJobService(cfg, workspaceSvc, dshSupervisor, events)
	backgroundJobSvc := nodebackgroundjob.NewService(nodebackgroundjob.Deps{
		Jobs: backgroundJobs, Workspaces: workspaceSvc, OwnerNodeID: cfg.NodeID,
		IsDSHConfigured: func() bool { return dshSupervisor != nil },
		IsDSHReady:      func() bool { return dshSupervisor != nil && dshSupervisor.Health().IsReady },
	})
	workspaceSvc.SetBackgroundJobCleanup(backgroundJobs.CancelWorkspace, backgroundJobs.AbortWorkspaceClose)

	terminalSvc := nodeterminal.NewService(nodeterminal.Deps{
		Workspace: workspaceSvc,
		Terminals: terminals,
		Events:    events,
		Session:   cfg.Session,
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
		registry:                    registry,
		store:                       store,
		files:                       filesService,
		git:                         gitService,
		terminals:                   terminals,
		memory:                      memorySvc,
		computer:                    computerSvc,
		modelList:                   modelList,
		agentMgr:                    agentMgr,
		piAuth:                      piAuth,
		tokenUsage:                  tokenUsage,
		events:                      events,
		watchers:                    watchers,
		prTracker:                   prTracker,
		cleanupStore:                cleanupStore,
		contextStore:                contextStore,
		database:                    cfg.Database,
		Session:                     cfg.Session,
		NodeID:                      cfg.NodeID,
		logFilePath:                 cfg.LogFilePath,
		settingsPath:                cfg.SettingsPath,
		serverCtx:                   context.Background(),
		agentLifecycleCtx:           agentLifecycleCtx,
		cancelAgentLifecycle:        cancelAgentLifecycle,
		cleanupCtx:                  cleanupCtx,
		cancelCleanup:               cancelCleanup,
		backgroundJobRecoveryCtx:    backgroundJobRecoveryCtx,
		cancelBackgroundJobRecovery: cancelBackgroundJobRecovery,
		agentSvc:                    agentSvc,
		workspaceSvc:                workspaceSvc,
		localTaskSvc:                localTaskSvc,
		hookIngress:                 hookIngress,
		dsh:                         dshSupervisor,
		backgroundJobs:              backgroundJobs,
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
	if err := loadTaskContextRegistrations(context.Background(), memorySvc, localTaskSvc); err != nil {
		return nil, fmt.Errorf("register Local Task contexts: %w", err)
	}
	workspaceSvc.WatchActive()

	// Background tasks (and the lifecycle contexts that bound them).
	app.Start()

	systemSvc := nodesystem.NewService(nodesystem.Deps{
		Session:      cfg.Session,
		Events:       events,
		ModelList:    modelList,
		TokenUsage:   tokenUsage,
		Memory:       memorySvc,
		TaskContexts: localTaskSvc,
		Registry:     registry,
		Computer:     computerSvc,
		ContextStore: contextStore,
		SettingsPath: cfg.SettingsPath,
		ServerCtx:    context.Background(),
	})
	app.router = buildNamespaceRouter(agentSvc, backgroundJobSvc, workspaceSvc, terminalSvc, projectSvc, systemSvc, localTaskSvc)
	app.rpcServer = rpc.NewServer(appHandler{router: app.router, agent: agentSvc})
	app.rpcServer.BinaryFrameHandler = terminalSvc
	app.relay = relay.NewClient(relay.ClientConfig{
		Session:     cfg.Session,
		NodeID:      cfg.NodeID,
		URL:         cfg.RelayURL,
		StaticToken: cfg.RelayToken,
		Server:      app.rpcServer,
		Handler:     relayHandler{system: systemSvc, workspace: workspaceSvc, terminal: terminalSvc, runtime: cfg.Session, daemonWSEndpoint: cfg.DaemonWSEndpoint},
		Events:      events,
	})
	terminalSvc.SetRelayClient(app.relay)
	workspaceSvc.SetRelayClient(app.relay)
	if err := app.startDSHSupervisor(); err != nil {
		log.Error().Err(err).Msg("DSH runtime unavailable; Pi fallback remains active")
	}

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

// Close stops the service graph without tearing down DSH or SQLite until
// background runners have quiesced.
func (a *App) Close() error {
	a.stopCloseSubscriptions()
	if a.cancelBackgroundJobRecovery != nil {
		a.cancelBackgroundJobRecovery()
	}
	if err := a.closeBackgroundJobs(); err != nil {
		return err
	}
	return a.closeDependencies()
}

func (a *App) stopCloseSubscriptions() {
	if a.events != nil {
		a.events.Unsubscribe(a.fileCacheSubID)
	}
	if a.prTracker != nil {
		a.prTracker.Stop()
	}
}
