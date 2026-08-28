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

// TestCloseWorkspaceLocally_MarksRemoteClosingThenRevertsOnTeardownFailure
// verifies the close ordering contract: the remote record is marked "closing"
// BEFORE the local teardown starts (so live lists stop showing the workspace
// during cleanup), and when the teardown fails the remote record is reverted
// to active so the workspace is not left hidden behind the closing tombstone.
func TestCloseWorkspaceLocally_MarksRemoteClosingThenRevertsOnTeardownFailure(t *testing.T) {
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

	if len(calls) < 2 {
		t.Fatalf("expected a closing mark and a failure revert, got %d calls: %v", len(calls), calls)
	}
	closingCall := calls[0]
	if !strings.Contains(closingCall, "PATCH /orgs/org-1/projects/project-1/workspaces/close") ||
		!strings.Contains(closingCall, `"status":"closing"`) {
		t.Errorf("expected the remote to be marked closing BEFORE teardown, got call[0] = %q", closingCall)
	}
	revertCall := calls[1]
	if !strings.Contains(revertCall, "PATCH /orgs/org-1/projects/project-1/workspaces/ws-1") ||
		!strings.Contains(revertCall, `"localPath":"/tmp/ws"`) {
		t.Errorf("expected the remote to be reverted to active after teardown failure, got call[1] = %q", revertCall)
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

func TestService_CloseCleanupAbortReopensBackgroundJobAdmission(t *testing.T) {
	var canceled, reopened, agentAborted int
	service := &Service{deps: Deps{
		BackgroundJobCleanup:      func(context.Context, string) error { canceled++; return nil },
		AbortBackgroundJobCleanup: func(string) { reopened++ },
		BeginAgentCleanup:         func(context.Context, string) (any, error) { return "agent", nil },
		AbortAgentCleanup: func(handle any) {
			if handle != "agent" {
				t.Fatalf("agent handle = %#v", handle)
			}
			agentAborted++
		},
	}}
	handle, err := service.beginAgentCleanup(context.Background(), "ws-1")
	if err != nil {
		t.Fatal(err)
	}
	service.abortAgentCleanup(handle)
	if canceled != 1 || reopened != 1 || agentAborted != 1 {
		t.Fatalf("cleanup lifecycle = %d/%d/%d", canceled, reopened, agentAborted)
	}
}
