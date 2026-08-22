package workspace

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	workspaceDomain "yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestRetryClose_PersistedWorkspaceWithoutHydratedRuntime(t *testing.T) {
	database := openMigratedTestDB(t)
	svc := newBehaviorHandler(t, nil, "node-1", database)
	store := sqlite.NewWorkspaceStore(database)
	workspaceID := "persisted-only"
	path := t.TempDir()
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: workspaceID, Kind: string(workspaceDomain.KindWorktree), Status: "active",
		LocalPath: path, State: string(workspaceDomain.StateActive),
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	// Startup retries can run before this persisted workspace is hydrated.
	svc.deps.Registry = nil
	if err := svc.RetryClose(context.Background(), application.CleanupRequest{
		WorkspaceID: workspaceID,
		Path:        path,
	}); err != nil {
		t.Fatalf("retry persisted cleanup without runtime: %v", err)
	}

	persisted, err := store.Get(context.Background(), workspaceID)
	if err != nil {
		t.Fatalf("get closed workspace: %v", err)
	}
	if persisted.Status != string(workspaceDomain.StatusClosed) {
		t.Fatalf("persisted status = %q, want %q", persisted.Status, workspaceDomain.StatusClosed)
	}
}
