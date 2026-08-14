package workspace

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
)

func TestManagerHydrateFromDB_RestoresActiveWorkspace(t *testing.T) {
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	workspacePath := t.TempDir()
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	metadata := `{"number":42,"status":"open","checks":[]}`
	if err := workspaceStore.UpsertPR(context.Background(), &localdb.WorkspacePullRequest{
		WorkspaceID: "workspace-1", OrganizationID: "org-1", PRID: "42", State: "open",
		Metadata: &metadata, DetectedAt: "2026-07-29T00:00:00Z",
	}); err != nil {
		t.Fatalf("create pull request: %v", err)
	}

	manager := NewManagerWithStore(workspaceStore)
	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("get hydrated workspace: %v", err)
	}
	canonicalWorkspacePath, err := filepath.EvalSymlinks(workspacePath)
	if err != nil {
		t.Fatalf("canonicalize workspace path: %v", err)
	}
	if workspace.Path != canonicalWorkspacePath || workspace.ProjectID != "project-1" {
		t.Fatalf("unexpected hydrated workspace: %#v", workspace)
	}
	if workspace.PullRequest == nil || workspace.PullRequest.Number != 42 {
		t.Fatalf("expected hydrated pull request, got %#v", workspace.PullRequest)
	}
}

func TestManagerOpen_CanonicalizesSymlinkedWorkspacePath(t *testing.T) {
	realWorkspacePath, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}
	root := t.TempDir()
	symlinkPath := filepath.Join(root, "workspace-link")
	if err := os.Symlink(realWorkspacePath, symlinkPath); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	manager := NewManager()
	openedWorkspace, err := manager.Open(OpenRequest{ID: "ws-1", Path: symlinkPath})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if openedWorkspace.Path != realWorkspacePath {
		t.Fatalf("expected canonical workspace path %q, got %q", realWorkspacePath, openedWorkspace.Path)
	}

	handle, err := manager.WorkspaceHandleByPath(symlinkPath)
	if err != nil {
		t.Fatalf("workspace handle by symlink path: %v", err)
	}
	if handle.Workspace().Path != realWorkspacePath {
		t.Fatalf("expected handle to resolve canonical path %q, got %q", realWorkspacePath, handle.Workspace().Path)
	}
}

func TestManagerOpen_ReplacesExistingWorkspaceForSamePath(t *testing.T) {
	root := t.TempDir()
	manager := NewManager()

	if _, err := manager.Open(OpenRequest{ID: "stale-id", Path: root}); err != nil {
		t.Fatalf("open stale workspace: %v", err)
	}

	openedWorkspace, err := manager.Open(OpenRequest{
		ID:        "workspace-1",
		Path:      root,
		OrgID:     "org-1",
		ProjectID: "project-1",
	})
	if err != nil {
		t.Fatalf("re-open workspace with authoritative metadata: %v", err)
	}
	if openedWorkspace.ID != "workspace-1" {
		t.Fatalf("expected authoritative workspace id to be kept, got %q", openedWorkspace.ID)
	}
	if openedWorkspace.OrgID != "org-1" {
		t.Fatalf("expected org id to be updated, got %q", openedWorkspace.OrgID)
	}
	if openedWorkspace.ProjectID != "project-1" {
		t.Fatalf("expected project id to be updated, got %q", openedWorkspace.ProjectID)
	}

	if _, err := manager.GetWorkspace("stale-id"); err == nil {
		t.Fatal("expected stale workspace id to be removed after path re-open")
	}

	workspaces := manager.List()
	if len(workspaces) != 1 {
		t.Fatalf("expected exactly one workspace after re-open, got %d", len(workspaces))
	}
	if workspaces[0].ID != "workspace-1" {
		t.Fatalf("expected only authoritative workspace to remain, got %q", workspaces[0].ID)
	}
}

func TestManagerCloseWorkspace_ReplacedPathWithFileSucceeds(t *testing.T) {
	manager := NewManager()
	workspacePath := t.TempDir()
	if _, err := manager.Open(OpenRequest{ID: "ws-1", Path: workspacePath}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}
	if err := os.WriteFile(workspacePath, []byte("x"), 0o600); err != nil {
		t.Fatalf("replace path with file: %v", err)
	}

	if _, err := manager.CloseWorkspace(context.Background(), CloseRequest{WorkspaceID: "ws-1"}); err != nil {
		t.Fatalf("close workspace with replaced path: %v", err)
	}
	if _, err := manager.GetWorkspace("ws-1"); err == nil {
		t.Fatal("expected workspace removed from memory after close")
	}
}

func TestManagerCloseWorkspace_NotGitRepositorySucceeds(t *testing.T) {
	manager := NewManager()
	workspacePath := t.TempDir()
	if _, err := manager.Open(OpenRequest{ID: "ws-1", Path: workspacePath}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	if _, err := manager.CloseWorkspace(context.Background(), CloseRequest{WorkspaceID: "ws-1"}); err != nil {
		t.Fatalf("close workspace with non-git path: %v", err)
	}
	if _, err := manager.GetWorkspace("ws-1"); err == nil {
		t.Fatal("expected workspace removed from memory after close")
	}
	if _, err := os.Stat(workspacePath); err != nil {
		t.Fatalf("expected leftover directory to remain after close: %v", err)
	}
}

func openTestManagerStore(t *testing.T) (*Manager, *localdb.WorkspaceStore) {
	t.Helper()
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	store := localdb.NewWorkspaceStore(database)
	return NewManagerWithStore(store), store
}

func TestManagerHydrateFromDB_MissingWorktreeMarkedError(t *testing.T) {
	manager, store := openTestManagerStore(t)
	missingPath := filepath.Join(t.TempDir(), "deleted-worktree")
	branchMissing := "feature/missing"
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branchMissing, LocalPath: missingPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	healthyPath := t.TempDir()
	branchHealthy := "feature/healthy"
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-2", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branchHealthy, LocalPath: healthyPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}

	healthy, err := manager.GetWorkspace("workspace-2")
	if err != nil {
		t.Fatalf("expected healthy workspace restored: %v", err)
	}
	if healthy.State != WorkspaceStateActive {
		t.Fatalf("expected healthy workspace active, got %q", healthy.State)
	}

	broken, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("expected missing-path workspace registered as error: %v", err)
	}
	if broken.State != WorkspaceStateError || broken.Health != WorkspaceHealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", broken.State, broken.Health)
	}

	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != WorkspaceStateError || persisted.Health == nil || *persisted.Health != WorkspaceHealthPathMissing {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
	if persisted.Status != "active" {
		t.Fatalf("expected persisted status to stay active, got %q", persisted.Status)
	}
}

func TestManagerHydrateFromDB_NonMissingOpenFailureMarkedError(t *testing.T) {
	manager, store := openTestManagerStore(t)
	filePath := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(filePath, []byte("x"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}
	branch := "feature/file"
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: filePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	ws, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("expected workspace registered as error: %v", err)
	}
	if ws.State != WorkspaceStateError || ws.Health != WorkspaceHealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", ws.State, ws.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != WorkspaceStateError || persisted.Health == nil || *persisted.Health != WorkspaceHealthPathMissing {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

func TestManagerHydrateFromDB_SkipsClosedWorkspaces(t *testing.T) {
	manager, store := openTestManagerStore(t)
	missingPath := filepath.Join(t.TempDir(), "deleted-worktree")
	branch := "feature/closed"
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "closed", Branch: &branch, LocalPath: missingPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	if _, err := manager.GetWorkspace("workspace-1"); err == nil {
		t.Fatal("expected closed workspace to be skipped, not registered")
	}
}

func TestManagerHydrateFromDB_RestoresActiveWorkspaceAndRefreshesState(t *testing.T) {
	manager, store := openTestManagerStore(t)
	workspacePath := t.TempDir()
	branch := "feature/restored"
	health := WorkspaceHealthPathMissing
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: WorkspaceStateError, Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("get hydrated workspace: %v", err)
	}
	if workspace.State != WorkspaceStateActive || workspace.Health != "" {
		t.Fatalf("expected restored workspace active with cleared health, got state=%q health=%q", workspace.State, workspace.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != WorkspaceStateActive || (persisted.Health != nil && *persisted.Health != "") {
		t.Fatalf("expected persisted active with cleared health, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

func TestManagerHydrateFromDB_PreservesNotWorktreeError(t *testing.T) {
	manager, store := openTestManagerStore(t)
	// Plain directory without .git: Open succeeds, but the persisted
	// not-worktree error must survive rehydration.
	workspacePath := t.TempDir()
	branch := "feature/not-worktree"
	health := WorkspaceHealthNotWorktree
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: WorkspaceStateError, Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("get hydrated workspace: %v", err)
	}
	if workspace.State != WorkspaceStateError || workspace.Health != WorkspaceHealthNotWorktree {
		t.Fatalf("expected preserved error/not-worktree, got state=%q health=%q", workspace.State, workspace.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != WorkspaceStateError || persisted.Health == nil || *persisted.Health != WorkspaceHealthNotWorktree {
		t.Fatalf("expected persisted error/not-worktree, got state=%q health=%v", persisted.State, persisted.Health)
	}
}
