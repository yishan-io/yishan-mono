package node

import (
	"context"

	"database/sql"
	"fmt"
	"path/filepath"
	"yishan/apps/cli/internal/files"

	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/memory"
	cliruntime "yishan/apps/cli/internal/runtime"
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
}

// App is the daemon's service composition root. It owns every business
// service, the background tasks, and the shutdown order (Close).
type App struct {
	Manager      *workspace.Manager
	Memory       *memory.Service
	Computer     *computer.Service
	ModelList    *modellist.Service
	AgentMgr     *agentmanager.Manager
	PIAuth       *piauth.Store
	TokenUsage   tokenusage.Service
	Events       *internalevents.Hub
	Watchers     *workspacewatchers.Watchers
	PRTracker    *workspaceprtracker.Tracker
	CleanupStore *CleanupStore
	ContextStore *ContextStore
	Database     *sql.DB
	Runtime      *cliruntime.Runtime
	NodeID       string
	LogFilePath  string
	SettingsPath string

	// AgentLifecycleCtx bounds pi agent process lifetimes; Close cancels it
	// before stopping the agent manager.
	AgentLifecycleCtx context.Context
	// ServerCtx is the long-lived context RPC handlers use for server-side
	// work (memory searches, relayed creates).
	ServerCtx context.Context

	cleanupCtx           context.Context
	cancelCleanup        context.CancelFunc
	cancelAgentLifecycle context.CancelFunc
	fileCacheSubID       uint64
}

// Bootstrap composes the daemon's service graph for one account. It mirrors
// the historical daemon startup order: workspace store → cleanup store →
// context store → token usage → computer (+ settings) → memory → hydrate →
// watch → background tasks.
func Bootstrap(cfg Config) (*App, error) {
	registry := instance.NewRegistry(files.NewFileService())
	manager := workspace.NewManagerWithRegistryAndStore(registry, localdb.NewStore(localdb.NewWorkspaceStore(cfg.Database)))

	legacyCleanupPath := filepath.Join(cfg.DataDir, cleanupFileName)
	cleanupStore, err := NewCleanupStore(cfg.Database, legacyCleanupPath)
	if err != nil {
		return nil, fmt.Errorf("create workspace cleanup store: %w", err)
	}

	events := internalevents.NewHub()
	prTracker := workspaceprtracker.New(manager, cfg.Runtime, func(event workspaceprtracker.PullRequestUpdatedEvent) {
		publishWorkspacePullRequestUpdatedEvent(events, event)
	})
	watchers := newWatchersForEventHub(events, prTracker.RefreshWorkspaceByPath)
	// Watcher and PR-tracker cleanup follows instance removal (close, rollback,
	// or same-path replacement in the registry).
	manager.Instances().SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})

	tokenUsage := cfg.TokenUsage
	if tokenUsage == nil {
		tokenUsage = tokenusage.NewCollectorWithRepository(
			manager,
			cfg.Runtime,
			localdb.NewHourlyUsageStore(cfg.Database),
			cfg.EnvDir,
		)
	}

	app := &App{
		Manager:      manager,
		Computer:     NewDefaultComputerService(),
		ModelList:    modellist.NewService(),
		AgentMgr:     agentmanager.NewManager(),
		PIAuth:       newManagedPiAuthStore(),
		TokenUsage:   tokenUsage,
		Events:       events,
		Watchers:     watchers,
		PRTracker:    prTracker,
		CleanupStore: cleanupStore,
		ContextStore: NewContextStore(cfg.SettingsPath),
		Database:     cfg.Database,
		Runtime:      cfg.Runtime,
		NodeID:       cfg.NodeID,
		LogFilePath:  cfg.LogFilePath,
		SettingsPath: cfg.SettingsPath,
		ServerCtx:    context.Background(),
	}

	// Computer feature config comes from settings.yaml.
	if err := app.applyComputerSettings(); err != nil {
		return nil, err
	}

	// Memory service initialization is non-fatal: memory features are disabled
	// but the daemon keeps running.
	app.initMemory(cfg.DataDir, cfg.MemorySummarizer)

	// Restore persisted workspaces and register a filesystem watcher for every
	// active one (see WatchActiveWorkspaces for why hydration is not enough).
	if err := manager.HydrateFromDB(context.Background()); err != nil {
		return nil, fmt.Errorf("restore persisted workspaces: %w", err)
	}
	app.WatchActiveWorkspaces()

	// Background tasks (and the lifecycle contexts that bound them).
	app.Start()

	return app, nil
}

// Start creates the agent/cleanup lifecycle contexts and starts the
// background tasks owned by the app: file-cache consumer, token-usage startup
// scan, pending-cleanup retry, and the workspace health monitor.
func (a *App) Start() {
	a.cleanupCtx, a.cancelCleanup = context.WithCancel(context.Background())
	a.AgentLifecycleCtx, a.cancelAgentLifecycle = context.WithCancel(context.Background())
	a.StartFileCacheConsumer()
	if a.TokenUsage != nil {
		a.TokenUsage.StartStartupScan()
	}
	a.StartCleanupRetry()
	a.StartHealthMonitor()
}

// applyComputerSettings loads the computer-use feature config from
// settings.yaml. A missing/empty settings path leaves the defaults.
func (a *App) applyComputerSettings() error {
	if a.SettingsPath == "" || a.Computer == nil {
		return nil
	}
	cfg, err := config.LoadSettings(a.SettingsPath, nil)
	if err != nil {
		return fmt.Errorf("load computer settings: %w", err)
	}
	a.Computer.UpdateConfig(computer.FeatureConfig{
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
	if a.Events != nil {
		a.Events.Unsubscribe(a.fileCacheSubID)
	}
	if a.PRTracker != nil {
		a.PRTracker.Stop()
	}
	if a.TokenUsage != nil {
		a.TokenUsage.Close()
	}
	if a.Memory != nil {
		if err := a.Memory.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close memory service")
		}
	}
	if a.cancelAgentLifecycle != nil {
		a.cancelAgentLifecycle()
	}
	if a.AgentMgr != nil {
		a.AgentMgr.StopAll()
	}
	modellist.ShutdownShell()
	if a.cancelCleanup != nil {
		a.cancelCleanup()
	}
	if a.Database != nil {
		if err := a.Database.Close(); err != nil {
			log.Warn().Err(err).Msg("failed to close local database")
		}
	}
	return nil
}
