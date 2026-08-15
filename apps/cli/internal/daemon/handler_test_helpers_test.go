package daemon

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
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
	workspaceprtracker "yishan/apps/cli/internal/workspace/prtracker"
)

// newTestJSONRPCHandler builds a handler around a composed test node app,
// mirroring the non-database steps of node.Bootstrap (events, watchers, PR
// tracker, computer, model list, agent manager, pi auth, contexts). Tests that
// need the local database attach it afterwards via handler.localDatabase.
func newTestJSONRPCHandler(t *testing.T, manager *workspace.Manager, runtime *cliruntime.Runtime, nodeID string) *JSONRPCHandler {
	t.Helper()
	app := newTestApp(t, manager, runtime, nodeID)
	handler := NewJSONRPCHandler(app)
	t.Cleanup(func() { _ = app.Close() })
	return handler
}

func newTestApp(t *testing.T, manager *workspace.Manager, runtime *cliruntime.Runtime, nodeID string) *node.App {
	t.Helper()
	root := t.TempDir()
	events := internalevents.NewHub()
	prTracker := workspaceprtracker.New(manager, runtime, func(event workspaceprtracker.PullRequestUpdatedEvent) {
		node.PublishPullRequestUpdated(events, event)
	})
	watchers := node.NewWatchers(events, prTracker.RefreshWorkspaceByPath)
	manager.Instances().SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})
	app := &node.App{
		Manager:      manager,
		Computer:     computer.NewService(computer.NewUnavailableRuntime("unknown")),
		ModelList:    modellist.NewService(),
		AgentMgr:     agentmanager.NewManager(),
		PIAuth:       node.NewManagedPiAuthStore(),
		Events:       events,
		Watchers:     watchers,
		PRTracker:    prTracker,
		ContextStore: node.NewContextStore(""),
		Runtime:      runtime,
		NodeID:       nodeID,
		LogFilePath:  filepath.Join(root, "daemon.log"),
		SettingsPath: filepath.Join(root, "config.yml"),
		ServerCtx:    context.Background(),
	}
	app.Start()
	return app
}

func expectEventTopic(t *testing.T, events <-chan frontendEvent, wantTopic string) frontendEvent {
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

func expectNoEvent(t *testing.T, events <-chan frontendEvent, wait time.Duration) {
	t.Helper()

	select {
	case event := <-events:
		t.Fatalf("expected no event, got topic %q", event.Topic)
	case <-time.After(wait):
	}
}

// setTestDatabase attaches the local SQLite handle to both the handler and the
// node app (production sets both from node.Bootstrap).
func (h *JSONRPCHandler) setTestDatabase(database *sql.DB) {
	h.localDatabase = database
	h.nodeApp.Database = database
}

// callRPCForTest routes a method+params through the namespace router, the same
// path rpc.Server uses for live connections.
func (h *JSONRPCHandler) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return h.router.Call(ctx, &rpc.Connection{}, method, params)
}
