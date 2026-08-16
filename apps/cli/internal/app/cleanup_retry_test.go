package app

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
)

func openCleanupStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return database
}

func TestRetryPendingWorkspaceCleanups_MarksWorkspaceClosed(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	cleanupStore, err := sqlite.NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), sqlite.PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new cleanup store: %v", err)
	}
	workspacePath := t.TempDir()
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := cleanupStore.Add(sqlite.PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: workspacePath}); err != nil {
		t.Fatalf("add pending cleanup: %v", err)
	}

	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{
		CleanupStore: cleanupStore,
		Database:     database,
		ServerCtx:    context.Background(),
	})
	app := &App{
		store:        sqlite.NewStore(workspaceStore),
		cleanupStore: cleanupStore,
		database:     database,
		workspaceSvc: workspaceSvc,
	}

	app.retryPendingCleanups(context.Background())

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
