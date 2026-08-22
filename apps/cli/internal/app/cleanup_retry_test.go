package app

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
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

func TestRetryPendingWorkspaceCleanups_BeginFailurePreservesPendingCleanup(t *testing.T) {
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
	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{CleanupStore: cleanupStore, Database: database, ServerCtx: context.Background()})
	workspaceSvc.SetAgentCleanupLifecycle(
		func(context.Context, string) (any, error) { return "cleanup", context.DeadlineExceeded },
		func(any) {},
		func(any) { t.Fatal("must not commit failed retry") },
	)
	app := &App{store: sqlite.NewStore(workspaceStore), cleanupStore: cleanupStore, database: database, workspaceSvc: workspaceSvc}

	app.retryPendingCleanups(context.Background())

	items, err := cleanupStore.List()
	if err != nil {
		t.Fatalf("list pending cleanups: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("pending cleanups = %d, want 1", len(items))
	}
	persisted, err := workspaceStore.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.Status != "active" {
		t.Fatalf("workspace status = %q, want active", persisted.Status)
	}
}

func TestRetryPendingWorkspaceCleanups_StopsAgentsBeforeRemovingPath(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	cleanupStore, err := sqlite.NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), sqlite.PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new cleanup store: %v", err)
	}
	workspacePath := createRetryWorktree(t)
	if err := cleanupStore.Add(sqlite.PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: workspacePath}); err != nil {
		t.Fatalf("add pending cleanup: %v", err)
	}
	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{CleanupStore: cleanupStore, Database: database, ServerCtx: context.Background()})
	wasPresentWhenStopped := false
	workspaceSvc.SetAgentCleanupLifecycle(
		func(context.Context, string) (any, error) {
			_, statErr := os.Stat(workspacePath)
			wasPresentWhenStopped = statErr == nil
			return "cleanup", nil
		},
		func(any) { t.Fatal("successful retry must not abort agent cleanup") },
		func(any) {},
	)
	app := &App{cleanupStore: cleanupStore, database: database, workspaceSvc: workspaceSvc}

	app.retryPendingCleanups(context.Background())

	if !wasPresentWhenStopped {
		t.Fatal("agent cleanup did not run before worktree removal")
	}
	if _, err := os.Stat(workspacePath); !os.IsNotExist(err) {
		t.Fatalf("workspace path still exists after retry: %v", err)
	}
}

func TestRetryPendingWorkspaceCleanups_FailureRetainsPathAndPendingEntry(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	cleanupStore, err := sqlite.NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), sqlite.PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new cleanup store: %v", err)
	}
	workspacePath := t.TempDir()
	if err := cleanupStore.Add(sqlite.PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: workspacePath}); err != nil {
		t.Fatalf("add pending cleanup: %v", err)
	}
	workspaceSvc := nodeworkspace.NewService(nodeworkspace.Deps{CleanupStore: cleanupStore, Database: database, ServerCtx: context.Background()})
	workspaceSvc.SetAgentCleanupLifecycle(
		func(context.Context, string) (any, error) { return "cleanup", context.DeadlineExceeded },
		func(any) {},
		func(any) { t.Fatal("failed retry must not commit agent cleanup") },
	)
	app := &App{cleanupStore: cleanupStore, database: database, workspaceSvc: workspaceSvc}

	app.retryPendingCleanups(context.Background())

	if _, err := os.Stat(workspacePath); err != nil {
		t.Fatalf("failed retry removed workspace path: %v", err)
	}
	items, err := cleanupStore.List()
	if err != nil {
		t.Fatalf("list pending cleanups: %v", err)
	}
	if len(items) != 1 || items[0].Path != workspacePath {
		t.Fatalf("pending cleanups = %#v, want retained path %q", items, workspacePath)
	}
}

func createRetryWorktree(t *testing.T) string {
	t.Helper()
	repositoryPath := filepath.Join(t.TempDir(), "repository")
	workspacePath := filepath.Join(t.TempDir(), "workspace")
	for _, args := range [][]string{{"init", "-b", "main", repositoryPath}, {"-C", repositoryPath, "config", "user.email", "test@example.com"}, {"-C", repositoryPath, "config", "user.name", "Test"}} {
		runRetryGit(t, args...)
	}
	if err := os.WriteFile(filepath.Join(repositoryPath, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	runRetryGit(t, "-C", repositoryPath, "add", "seed.txt")
	runRetryGit(t, "-C", repositoryPath, "commit", "-m", "initial")
	runRetryGit(t, "-C", repositoryPath, "worktree", "add", "-b", "retry", workspacePath)
	return workspacePath
}

func runRetryGit(t *testing.T, args ...string) {
	t.Helper()
	if output, err := exec.Command("git", args...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}
