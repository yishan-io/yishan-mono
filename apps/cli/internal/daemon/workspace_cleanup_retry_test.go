package daemon

import (
	"context"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/dbconv"
	"yishan/apps/cli/internal/workspace"
)

func TestRetryPendingWorkspaceCleanups_MarksWorkspaceClosed(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	cleanupStore, err := newWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), workspaceCleanupFileName))
	if err != nil {
		t.Fatalf("new cleanup store: %v", err)
	}
	workspacePath := t.TempDir()
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := cleanupStore.Add(pendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: workspacePath}); err != nil {
		t.Fatalf("add pending cleanup: %v", err)
	}

	manager := workspace.NewManagerWithStore(dbconv.NewStore(workspaceStore))
	handler := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(t.TempDir(), "daemon.log"),
		cleanupStore,
		filepath.Join(t.TempDir(), "config.yml"),
		NewAppContextStore(""),
	)
	handler.SetLocalDatabase(database, t.TempDir())

	handler.retryPendingWorkspaceCleanups(context.Background())

	items, err := cleanupStore.List()
	if err != nil {
		t.Fatalf("list pending cleanups: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected no pending cleanups after retry, got %d", len(items))
	}
	persisted, err := workspaceStore.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.Status != "closed" {
		t.Fatalf("expected workspace status closed, got %q", persisted.Status)
	}
}
