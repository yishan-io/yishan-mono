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
	"yishan/apps/cli/internal/contextstore"
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

// newTestService builds the local Node application boundary for tests,
// mirroring the non-database dependency wiring of app.Bootstrap (events,
// watchers, PR tracker, computer, model list, agent manager, pi auth,
// contexts). Tests that need the local database attach it afterwards via
// setTestDatabase. The router is built by the composition root (internal/app).
func newTestService(t *testing.T, runtime *cliruntime.Runtime, nodeID string) *Service {
	t.Helper()
	root := t.TempDir()
	events := internalevents.NewHub()
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
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

	agentLifecycleCtx, cancelAgentLifecycle := context.WithCancel(context.Background())
	handler := NewService(Dependencies{
		Registry:             registry,
		Files:                filesService,
		Git:                  gitService,
		Terminals:            terminals,
		Computer:             computer.NewService(computer.NewUnavailableRuntime("unknown")),
		ModelList:            modellist.NewService(),
		AgentMgr:             agentmanager.NewManager(),
		PIAuth:               NewManagedPiAuthStore(),
		Events:               events,
		Watchers:             watchers,
		PRTracker:            prTracker,
		ContextStore:         contextstore.NewStore(""),
		Runtime:              runtime,
		NodeID:               nodeID,
		LogFilePath:          filepath.Join(root, "daemon.log"),
		SettingsPath:         filepath.Join(root, "config.yml"),
		AgentLifecycleCtx:    agentLifecycleCtx,
		AgentLifecycleCancel: cancelAgentLifecycle,
		ServerCtx:            context.Background(),
	})
	handler.SetRouter(buildTestRouter(handler))
	handler.relayClient = relay.NewClient(relay.ClientConfig{
		Runtime: runtime,
		NodeID:  nodeID,
		// No URL/static token: the client stays disconnected unless a test
		// wires it to a fake relay (wireRelayReader/wireRelayCapture).
		Server:  rpc.NewServer(handler),
		Handler: handler,
		Events:  events,
	})
	return handler
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

// setTestDatabase attaches the local SQLite handle to the service (production
// wires it through app.Bootstrap).
func (s *Service) setTestDatabase(database *sql.DB) {
	s.deps.Database = database
}

// callRPCForTest routes a method+params through the namespace router, the same
// path rpc.Server uses for live connections.
func (s *Service) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}

// callAgentRPCForTest routes an agent-namespace method (pi./skill./customize.)
// through the namespace router with an explicit connection, the same path
// rpc.Server uses for live connections.
func (s *Service) callAgentRPCForTest(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, conn, method, params)
}

// TestNewService_ReceivesDependencies guards the Service↔Dependencies wiring:
// every service the RPC layer needs must be delivered through the explicit
// Dependencies struct (a missed dependency silently breaks the daemon in
// production while tests pass, because test helpers set fields directly).
func TestNewService_ReceivesDependencies(t *testing.T) {
	registry := instance.NewRegistry(files.NewFileService())
	gitService := git.NewGitService()
	terminals := terminal.NewManager()
	deps := Dependencies{
		Registry:          registry,
		Files:             files.NewFileService(),
		Git:               gitService,
		Terminals:         terminals,
		Computer:          computer.NewService(computer.NewUnavailableRuntime("unknown")),
		ModelList:         modellist.NewService(),
		AgentMgr:          agentmanager.NewManager(),
		PIAuth:            NewManagedPiAuthStore(),
		Events:            internalevents.NewHub(),
		Watchers:          NewWatchers(internalevents.NewHub(), nil),
		PRTracker:         workspaceprtracker.New(workspaceprtracker.TrackerDeps{Instances: registry, Gits: gitService}),
		ContextStore:      contextstore.NewStore(""),
		Runtime:           nil,
		NodeID:            "node-1",
		LogFilePath:       "daemon.log",
		SettingsPath:      "settings.yml",
		AgentLifecycleCtx: context.Background(),
		ServerCtx:         context.Background(),
	}
	handler := NewService(deps)

	if handler.deps.Registry != registry || handler.deps.Files != deps.Files || handler.deps.Git != gitService || handler.deps.Terminals != terminals {
		t.Fatal("service did not receive workspace capability dependencies")
	}
	if handler.deps.Events != deps.Events || handler.deps.Watchers != deps.Watchers || handler.deps.PRTracker != deps.PRTracker {
		t.Fatal("service did not receive event/watcher dependencies")
	}
	if handler.deps.Computer != deps.Computer || handler.deps.ModelList != deps.ModelList ||
		handler.deps.AgentMgr != deps.AgentMgr || handler.deps.PIAuth != deps.PIAuth {
		t.Fatal("service did not receive business service dependencies")
	}
	if handler.deps.ContextStore != deps.ContextStore || handler.deps.SettingsPath != deps.SettingsPath ||
		handler.deps.AgentLifecycleCtx != deps.AgentLifecycleCtx || handler.deps.ServerCtx != deps.ServerCtx {
		t.Fatal("service did not receive store/context dependencies")
	}
	if handler.app == nil {
		t.Fatal("service must wire the workspace application service")
	}
}

// buildTestRouter wires the namespace routing table for tests (the production
// path builds it in internal/app; tests build their own so the node package
// never imports the composition root).
func buildTestRouter(service *Service) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: service})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: service})
	router.Register("context", &rpc.ContextHandler{Services: service})
	router.Register("git", &rpc.GitHandler{Services: service})
	router.Register("file", &rpc.FileHandler{Services: service})
	router.Register("terminal", &rpc.TerminalHandler{Services: service})
	router.Register("computer", &rpc.ComputerHandler{Services: service})
	router.Register("memory", &rpc.MemoryHandler{Services: service})
	router.Register("project", &rpc.ProjectHandler{Services: service})
	router.Register("system", &rpc.SystemHandler{Services: service})
	router.Register("pi", &rpc.AgentHandler{Pi: service, Skill: service, Customize: service})
	router.Register("skill", &rpc.AgentHandler{Pi: service, Skill: service, Customize: service})
	router.Register("customize", &rpc.AgentHandler{Pi: service, Skill: service, Customize: service})
	return router
}
