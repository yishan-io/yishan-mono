package node

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
)

// newTestServices builds the services layer around a composed test node app,
// mirroring the non-database steps of node.Bootstrap (events, watchers, PR
// tracker, computer, model list, agent manager, pi auth, contexts). Tests that
// need the local database attach it afterwards via setTestDatabase.
func newTestServices(t *testing.T, runtime *cliruntime.Runtime, nodeID string) *Services {
	t.Helper()
	app := newTestApp(t, runtime, nodeID)
	handler := NewServices(app)
	handler.BuildRPCLayer()
	handler.relayClient = relay.NewClient(relay.ClientConfig{
		Runtime: runtime,
		NodeID:  nodeID,
		// No URL/static token: the client stays disconnected unless a test
		// wires it to a fake relay (wireRelayReader/wireRelayCapture).
		Server:  handler.rpcServer,
		Handler: handler,
		Events:  app.Events,
	})
	t.Cleanup(func() { _ = app.Close() })
	return handler
}

func newTestApp(t *testing.T, runtime *cliruntime.Runtime, nodeID string) *App {
	t.Helper()
	root := t.TempDir()
	events := internalevents.NewHub()
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
	store := localdb.NewStore(localdb.NewWorkspaceStore(nil))
	gitService := git.NewGitService()
	terminals := terminal.NewManager()
	prTracker := workspaceprtracker.New(workspaceprtracker.TrackerDeps{
		Instances: registry,
		Gits:      gitService,
		Runtime:   runtime,
		OnPullRequestUpdated: func(event workspaceprtracker.PullRequestUpdatedEvent) {
			PublishPullRequestUpdated(events, event)
		},
	})
	watchers := NewWatchers(events, prTracker.RefreshWorkspaceByPath)
	registry.SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})
	app := &App{
		Registry:     registry,
		Store:        store,
		Files:        filesService,
		Git:          gitService,
		Terminals:    terminals,
		Computer:     computer.NewService(computer.NewUnavailableRuntime("unknown")),
		ModelList:    modellist.NewService(),
		AgentMgr:     agentmanager.NewManager(),
		PIAuth:       NewManagedPiAuthStore(),
		Events:       events,
		Watchers:     watchers,
		PRTracker:    prTracker,
		ContextStore: NewContextStore(""),
		Runtime:      runtime,
		NodeID:       nodeID,
		LogFilePath:  filepath.Join(root, "daemon.log"),
		SettingsPath: filepath.Join(root, "config.yml"),
		ServerCtx:    context.Background(),
	}
	app.Start()
	return app
}

func expectEventTopic(t *testing.T, events <-chan internalevents.Event, wantTopic string) internalevents.Event {
	t.Helper()
	deadline := time.After(3 * time.Second)

	for {
		select {
		case event := <-events:
			if event.Topic == wantTopic {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s event", wantTopic)
		}
	}
}

func expectNoEvent(t *testing.T, events <-chan internalevents.Event, wait time.Duration) {
	t.Helper()

	select {
	case event := <-events:
		t.Fatalf("expected no event, got topic %q", event.Topic)
	case <-time.After(wait):
	}
}

// setTestDatabase attaches the local SQLite handle to both the handler and the
// node app (production sets both from node.Bootstrap).
func (s *Services) setTestDatabase(database *sql.DB) {
	s.localDatabase = database
	s.nodeApp.Database = database
}

// callRPCForTest routes a method+params through the namespace router, the same
// path rpc.Server uses for live connections.
func (s *Services) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}

// callAgentRPCForTest routes an agent-namespace method (pi./skill./customize.)
// through the namespace router with an explicit connection, the same path
// rpc.Server uses for live connections.
func (s *Services) callAgentRPCForTest(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, conn, method, params)
}

// TestNewServices_CopiesAppServices guards the handler↔app wiring:
// every service the RPC layer needs must be copied from the composed node app
// at construction (a missed copy silently breaks the daemon in production
// while tests pass, because test helpers set fields directly).
func TestNewServices_CopiesAppServices(t *testing.T) {
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	registry := instance.NewRegistry(files.NewFileService())
	app := &App{
		Registry:          registry,
		Store:             localdb.NewStore(localdb.NewWorkspaceStore(database)),
		Files:             files.NewFileService(),
		Git:               git.NewGitService(),
		Terminals:         terminal.NewManager(),
		Computer:          computer.NewService(computer.NewUnavailableRuntime("unknown")),
		ModelList:         modellist.NewService(),
		AgentMgr:          agentmanager.NewManager(),
		PIAuth:            NewManagedPiAuthStore(),
		Events:            internalevents.NewHub(),
		Watchers:          NewWatchers(internalevents.NewHub(), nil),
		PRTracker:         workspaceprtracker.New(workspaceprtracker.TrackerDeps{Instances: registry, Gits: git.NewGitService()}),
		ContextStore:      NewContextStore(""),
		Database:          database,
		Runtime:           nil,
		NodeID:            "node-1",
		LogFilePath:       "daemon.log",
		SettingsPath:      "settings.yml",
		AgentLifecycleCtx: context.Background(),
		ServerCtx:         context.Background(),
	}
	handler := NewServices(app)
	handler.BuildRPCLayer()

	if handler.localDatabase != app.Database {
		t.Fatal("handler.localDatabase must come from app.Database (production wiring)")
	}
	if handler.registry != app.Registry || handler.files != app.Files || handler.gits != app.Git || handler.terminals != app.Terminals {
		t.Fatal("handler did not copy app workspace capability services")
	}
	if handler.runtime != app.Runtime || handler.nodeID != app.NodeID {
		t.Fatal("handler did not copy app identity fields")
	}
	if handler.events != app.Events || handler.watchers != app.Watchers || handler.prTracker != app.PRTracker {
		t.Fatal("handler did not copy app event/watcher services")
	}
	if handler.tokenUsage != app.TokenUsage || handler.computer != app.Computer ||
		handler.modelList != app.ModelList || handler.memory != app.Memory ||
		handler.agentMgr != app.AgentMgr || handler.piAuth != app.PIAuth {
		t.Fatal("handler did not copy app business services")
	}
	if handler.cleanupStore != app.CleanupStore || handler.context != app.ContextStore ||
		handler.settingsPath != app.SettingsPath || handler.agentLifecycleCtx != app.AgentLifecycleCtx ||
		handler.serverCtx != app.ServerCtx {
		t.Fatal("handler did not copy app stores/contexts")
	}
	if handler.router == nil || handler.rpcServer == nil {
		t.Fatal("handler must build its router and rpc server")
	}
}
