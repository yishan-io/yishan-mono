package workspace

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

func TestHydrate_RestoresActiveWorkspace(t *testing.T) {
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	workspacePath := t.TempDir()
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	metadata := `{"number":42,"status":"open","checks":[]}`
	if err := workspaceStore.UpsertPR(context.Background(), &sqlite.WorkspacePullRequest{
		WorkspaceID: "workspace-1", OrganizationID: "org-1", PRID: "42", State: "open",
		Metadata: &metadata, DetectedAt: "2026-07-29T00:00:00Z",
	}); err != nil {
		t.Fatalf("create pull request: %v", err)
	}

	svc := NewService(Deps{Store: sqlite.NewStore(workspaceStore), Registry: instance.NewRegistry(files.NewFileService())})
	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, ok := svc.deps.Registry.Get("workspace-1")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
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

func TestOpen_CanonicalizesSymlinkedWorkspacePath(t *testing.T) {
	realWorkspacePath, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}
	root := t.TempDir()
	symlinkPath := filepath.Join(root, "workspace-link")
	if err := os.Symlink(realWorkspacePath, symlinkPath); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	svc := NewService(Deps{Registry: instance.NewRegistry(files.NewFileService()), Terminals: terminal.NewManager()})
	openedWorkspace, err := svc.Open(workspace.OpenRequest{ID: "ws-1", Path: symlinkPath})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if openedWorkspace.Path != realWorkspacePath {
		t.Fatalf("expected canonical workspace path %q, got %q", realWorkspacePath, openedWorkspace.Path)
	}

	// The instance registry resolves the canonical path: a symlink path must
	// resolve to the same instance as the real path.
	resolvedHandle, ok := svc.deps.Registry.GetByPath(symlinkPath)
	if !ok {
		t.Fatalf("workspace handle by symlink path not found")
	}
	if resolvedHandle.Path != realWorkspacePath {
		t.Fatalf("expected handle to resolve canonical path %q, got %q", realWorkspacePath, resolvedHandle.Path)
	}
}

func TestOpen_ReplacesExistingWorkspaceForSamePath(t *testing.T) {
	root := t.TempDir()
	svc := NewService(Deps{Registry: instance.NewRegistry(files.NewFileService()), Terminals: terminal.NewManager()})

	if _, err := svc.Open(workspace.OpenRequest{ID: "stale-id", Path: root}); err != nil {
		t.Fatalf("open stale workspace: %v", err)
	}

	openedWorkspace, err := svc.Open(workspace.OpenRequest{
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

	if _, ok := svc.deps.Registry.Get("stale-id"); ok {
		t.Fatal("expected stale workspace id to be removed after path re-open")
	}

	workspaces := svc.deps.Registry.List()
	if len(workspaces) != 1 {
		t.Fatalf("expected exactly one workspace after re-open, got %d", len(workspaces))
	}
	if workspaces[0].ID != "workspace-1" {
		t.Fatalf("expected only authoritative workspace to remain, got %q", workspaces[0].ID)
	}
}

func TestCloseWorkspace_ReplacedPathWithFileSucceeds(t *testing.T) {
	svc := NewService(Deps{Registry: instance.NewRegistry(files.NewFileService()), Terminals: terminal.NewManager()})
	workspacePath := t.TempDir()
	if _, err := svc.Open(workspace.OpenRequest{ID: "ws-1", Path: workspacePath}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}
	if err := os.WriteFile(workspacePath, []byte("x"), 0o600); err != nil {
		t.Fatalf("replace path with file: %v", err)
	}

	if _, err := svc.CloseLocal(context.Background(), workspace.CloseRequest{WorkspaceID: "ws-1"}); err != nil {
		t.Fatalf("close workspace with replaced path: %v", err)
	}
	if _, ok := svc.deps.Registry.Get("ws-1"); ok {
		t.Fatal("expected workspace removed from memory after close")
	}
}

func TestCloseWorkspace_NotGitRepositorySucceeds(t *testing.T) {
	svc := NewService(Deps{Registry: instance.NewRegistry(files.NewFileService()), Terminals: terminal.NewManager()})
	workspacePath := t.TempDir()
	if _, err := svc.Open(workspace.OpenRequest{ID: "ws-1", Path: workspacePath}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	if _, err := svc.CloseLocal(context.Background(), workspace.CloseRequest{WorkspaceID: "ws-1"}); err != nil {
		t.Fatalf("close workspace with non-git path: %v", err)
	}
	if _, ok := svc.deps.Registry.Get("ws-1"); ok {
		t.Fatal("expected workspace removed from memory after close")
	}
	if _, err := os.Stat(workspacePath); err != nil {
		t.Fatalf("expected leftover directory to remain after close: %v", err)
	}
}

func openTestManagerStore(t *testing.T) (*Service, *sqlite.WorkspaceStore) {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	store := sqlite.NewWorkspaceStore(database)
	return NewService(Deps{Store: sqlite.NewStore(store), Registry: instance.NewRegistry(files.NewFileService()), Terminals: terminal.NewManager()}), store
}

func TestHydrate_MissingWorktreeMarkedError(t *testing.T) {
	svc, store := openTestManagerStore(t)
	missingPath := filepath.Join(t.TempDir(), "deleted-worktree")
	branchMissing := "feature/missing"
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branchMissing, LocalPath: missingPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	healthyPath := t.TempDir()
	branchHealthy := "feature/healthy"
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-2", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branchHealthy, LocalPath: healthyPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}

	healthy, ok := svc.deps.Registry.Get("workspace-2")
	if !ok {
		t.Fatalf("expected healthy workspace restored: not found")
	}
	if healthy.State != workspace.StateActive {
		t.Fatalf("expected healthy workspace active, got %q", healthy.State)
	}

	broken, ok := svc.deps.Registry.Get("workspace-1")
	if !ok {
		t.Fatalf("expected missing-path workspace registered as error: not found")
	}
	if broken.State != workspace.StateError || broken.Health != workspace.HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", broken.State, broken.Health)
	}

	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateError) || persisted.Health == nil || *persisted.Health != string(workspace.HealthPathMissing) {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
	if persisted.Status != "active" {
		t.Fatalf("expected persisted status to stay active, got %q", persisted.Status)
	}
}

func TestHydrate_NonMissingOpenFailureMarkedError(t *testing.T) {
	svc, store := openTestManagerStore(t)
	filePath := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(filePath, []byte("x"), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}
	branch := "feature/file"
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: filePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	ws, ok := svc.deps.Registry.Get("workspace-1")
	if !ok {
		t.Fatalf("expected workspace registered as error: not found")
	}
	if ws.State != workspace.StateError || ws.Health != workspace.HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", ws.State, ws.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateError) || persisted.Health == nil || *persisted.Health != string(workspace.HealthPathMissing) {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

func TestHydrate_SkipsClosedWorkspaces(t *testing.T) {
	svc, store := openTestManagerStore(t)
	missingPath := filepath.Join(t.TempDir(), "deleted-worktree")
	branch := "feature/closed"
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "closed", Branch: &branch, LocalPath: missingPath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	if _, ok := svc.deps.Registry.Get("workspace-1"); ok {
		t.Fatal("expected closed workspace to be skipped, not registered")
	}
}

func TestHydrate_SkipsFolderWorkspaces(t *testing.T) {
	svc, store := openTestManagerStore(t)
	folderPath := t.TempDir()
	if _, err := store.CreateFolder(context.Background(), sqlite.FolderWorkspaceInput{
		LocalPath: folderPath, NodeID: "node-1",
	}); err != nil {
		t.Fatalf("create folder workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	// Folder workspaces must never be auto-opened at boot; the desktop opens
	// them on demand, so the manager must have no workspace for the folder.
	if folders := svc.deps.Registry.List(); len(folders) != 0 {
		t.Fatalf("expected no hydrated folder workspace, got %#v", folders)
	}
}

func TestHydrate_RestoresActiveWorkspaceAndRefreshesState(t *testing.T) {
	svc, store := openTestManagerStore(t)
	workspacePath := t.TempDir()
	branch := "feature/restored"
	health := string(workspace.HealthPathMissing)
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: string(workspace.StateError), Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	ws, ok := svc.deps.Registry.Get("workspace-1")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
	}
	if ws.State != workspace.StateActive || ws.Health != "" {
		t.Fatalf("expected restored workspace active with cleared health, got state=%q health=%q", ws.State, ws.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateActive) || (persisted.Health != nil && *persisted.Health != "") {
		t.Fatalf("expected persisted active with cleared health, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

func TestHydrate_PreservesNotWorktreeError(t *testing.T) {
	svc, store := openTestManagerStore(t)
	// Plain directory without .git: Open succeeds, but the persisted
	// not-worktree error must survive rehydration.
	workspacePath := t.TempDir()
	branch := "feature/not-worktree"
	health := string(workspace.HealthNotWorktree)
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: string(workspace.StateError), Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.Hydrate(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	ws, ok := svc.deps.Registry.Get("workspace-1")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
	}
	if ws.State != workspace.StateError || ws.Health != workspace.HealthNotWorktree {
		t.Fatalf("expected preserved error/not-worktree, got state=%q health=%q", ws.State, ws.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateError) || persisted.Health == nil || *persisted.Health != string(workspace.HealthNotWorktree) {
		t.Fatalf("expected persisted error/not-worktree, got state=%q health=%v", persisted.State, persisted.Health)
	}
}
