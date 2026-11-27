package workspace

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// TestCloseWorkspaceLocally_MakesNoRemoteCallsOnTeardownFailure verifies that
// a close, even a failing one, never writes a workspace record to api-service:
// workspace records are local only.
func TestCloseWorkspaceLocally_MakesNoRemoteCallsOnTeardownFailure(t *testing.T) {
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		calls = append(calls, r.Method+" "+r.URL.Path+" "+string(body))
		_, _ = w.Write([]byte(`{"workspace":{"id":"ws-1","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"closing","branch":"feature-a","sourceBranch":"main","localPath":"/tmp/ws","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}}`))
	}))
	defer server.Close()

	runtime := session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := newTestService(t, runtime, "node-1")

	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	// The local row exists (so the failure revert can resolve the worktree
	// path), but the workspace is NOT registered in the manager, so the local
	// teardown (manager.CloseWorkspace) fails.
	if err := sqlite.NewWorkspaceStore(database).Create(context.Background(), &sqlite.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: "/tmp/ws", State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	handler.setTestDatabase(database)

	_, err = handler.app.CloseLocal(context.Background(), workspaceCloseParams{
		WorkspaceID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1",
	})
	if err == nil {
		t.Fatalf("expected teardown failure (workspace not registered in manager)")
	}

	if len(calls) != 0 {
		t.Fatalf("workspace records are local; expected no api-service calls, got %v", calls)
	}
}

func TestWorkspaceClose_RemoteNode_RelaysInsteadOfLocalClose(t *testing.T) {
	s := newCloseRoutingTestHandler(t, "node-remote")
	params, err := json.Marshal(workspaceCloseParams{
		WorkspaceID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	_, err = s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, params)
	if err == nil || !strings.Contains(err.Error(), "relay not connected") {
		t.Fatalf("expected relay path (relay not connected), got err=%v", err)
	}
}

func TestWorkspaceClose_LocalNode_TakesLocalClosePath(t *testing.T) {
	s := newCloseRoutingTestHandler(t, "node-1")
	params, err := json.Marshal(workspaceCloseParams{
		WorkspaceID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	_, err = s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, params)
	if err == nil || strings.Contains(err.Error(), "relay not connected") {
		t.Fatalf("expected local close path (not relay), got err=%v", err)
	}
}
