package node

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	cliruntime "yishan/apps/cli/internal/runtime"
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

	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := newTestService(t, runtime, "node-1")

	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	// The local row exists (so the failure revert can resolve the worktree
	// path), but the workspace is NOT registered in the manager, so the local
	// teardown (manager.CloseWorkspace) fails.
	if err := localdb.NewWorkspaceStore(database).Create(context.Background(), &localdb.Workspace{
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
