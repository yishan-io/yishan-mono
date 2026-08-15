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

	manager := NewManagerWithStore(newTestManagerStore(workspaceStore))
	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, ok := manager.Instances().Get("workspace-1")
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

	// The instance registry resolves the canonical path: a symlink path must
	// resolve to the same instance as the real path.
	resolvedHandle, ok := manager.Instances().GetByPath(symlinkPath)
	if !ok {
		t.Fatalf("workspace handle by symlink path not found")
	}
	if resolvedHandle.Path != realWorkspacePath {
		t.Fatalf("expected handle to resolve canonical path %q, got %q", realWorkspacePath, resolvedHandle.Path)
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

	if _, ok := manager.Instances().Get("stale-id"); ok {
		t.Fatal("expected stale workspace id to be removed after path re-open")
	}

	workspaces := manager.Instances().List()
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
	if _, ok := manager.Instances().Get("ws-1"); ok {
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
	if _, ok := manager.Instances().Get("ws-1"); ok {
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
	return NewManagerWithStore(newTestManagerStore(store)), store
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

	healthy, ok := manager.Instances().Get("workspace-2")
	if !ok {
		t.Fatalf("expected healthy workspace restored: not found")
	}
	if healthy.State != StateActive {
		t.Fatalf("expected healthy workspace active, got %q", healthy.State)
	}

	broken, ok := manager.Instances().Get("workspace-1")
	if !ok {
		t.Fatalf("expected missing-path workspace registered as error: not found")
	}
	if broken.State != StateError || broken.Health != HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", broken.State, broken.Health)
	}

	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(StateError) || persisted.Health == nil || *persisted.Health != string(HealthPathMissing) {
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
	ws, ok := manager.Instances().Get("workspace-1")
	if !ok {
		t.Fatalf("expected workspace registered as error: not found")
	}
	if ws.State != StateError || ws.Health != HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", ws.State, ws.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(StateError) || persisted.Health == nil || *persisted.Health != string(HealthPathMissing) {
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
	if _, ok := manager.Instances().Get("workspace-1"); ok {
		t.Fatal("expected closed workspace to be skipped, not registered")
	}
}

func TestManagerHydrateFromDB_SkipsFolderWorkspaces(t *testing.T) {
	manager, store := openTestManagerStore(t)
	folderPath := t.TempDir()
	if _, err := store.CreateFolder(context.Background(), localdb.FolderWorkspaceInput{
		LocalPath: folderPath, NodeID: "node-1",
	}); err != nil {
		t.Fatalf("create folder workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	// Folder workspaces must never be auto-opened at boot; the desktop opens
	// them on demand, so the manager must have no workspace for the folder.
	if folders := manager.Instances().List(); len(folders) != 0 {
		t.Fatalf("expected no hydrated folder workspace, got %#v", folders)
	}
}

func TestManagerHydrateFromDB_RestoresActiveWorkspaceAndRefreshesState(t *testing.T) {
	manager, store := openTestManagerStore(t)
	workspacePath := t.TempDir()
	branch := "feature/restored"
	health := string(HealthPathMissing)
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: string(StateError), Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, ok := manager.Instances().Get("workspace-1")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
	}
	if workspace.State != StateActive || workspace.Health != "" {
		t.Fatalf("expected restored workspace active with cleared health, got state=%q health=%q", workspace.State, workspace.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(StateActive) || (persisted.Health != nil && *persisted.Health != "") {
		t.Fatalf("expected persisted active with cleared health, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

func TestManagerHydrateFromDB_PreservesNotWorktreeError(t *testing.T) {
	manager, store := openTestManagerStore(t)
	// Plain directory without .git: Open succeeds, but the persisted
	// not-worktree error must survive rehydration.
	workspacePath := t.TempDir()
	branch := "feature/not-worktree"
	health := string(HealthNotWorktree)
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath,
		State: string(StateError), Health: &health,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate manager: %v", err)
	}
	workspace, ok := manager.Instances().Get("workspace-1")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
	}
	if workspace.State != StateError || workspace.Health != HealthNotWorktree {
		t.Fatalf("expected preserved error/not-worktree, got state=%q health=%q", workspace.State, workspace.Health)
	}
	persisted, err := store.Get(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(StateError) || persisted.Health == nil || *persisted.Health != string(HealthNotWorktree) {
		t.Fatalf("expected persisted error/not-worktree, got state=%q health=%v", persisted.State, persisted.Health)
	}
}

// testManagerStore adapts the real SQLite store to the workspace.WorkspaceStore
// interface for workspace-package tests (the package cannot import dbconv
// without an import cycle).
type testManagerStore struct {
	raw *localdb.WorkspaceStore
}

func newTestManagerStore(raw *localdb.WorkspaceStore) *testManagerStore {
	return &testManagerStore{raw: raw}
}

func (s *testManagerStore) List(ctx context.Context) ([]StoredWorkspace, error) {
	rows, err := s.raw.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]StoredWorkspace, 0, len(rows))
	for _, row := range rows {
		out = append(out, StoredWorkspace{
			ID: row.ID, OrganizationID: row.OrganizationID, ProjectID: row.ProjectID,
			NodeID: row.NodeID, Kind: row.Kind, Status: row.Status,
			Branch: row.Branch, SourceBranch: row.SourceBranch,
			LocalPath: row.LocalPath, State: row.State, Health: row.Health,
		})
	}
	return out, nil
}

func (s *testManagerStore) Update(ctx context.Context, workspaceID string, update StoredWorkspaceUpdate) error {
	return s.raw.Update(ctx, workspaceID, localdb.WorkspaceUpdate{
		Status: update.Status, State: update.State, Health: update.Health,
		LocalPath: update.LocalPath, Branch: update.Branch,
	})
}

func (s *testManagerStore) ListPRsByWorkspace(ctx context.Context, workspaceID string) ([]StoredPullRequest, error) {
	rows, err := s.raw.ListPRsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	out := make([]StoredPullRequest, 0, len(rows))
	for _, row := range rows {
		out = append(out, StoredPullRequest{
			ID: row.ID, WorkspaceID: row.WorkspaceID, OrganizationID: row.OrganizationID,
			PRID: row.PRID, Title: row.Title, URL: row.URL, Branch: row.Branch,
			BaseBranch: row.BaseBranch, State: row.State, Metadata: row.Metadata,
			DetectedAt: row.DetectedAt, ResolvedAt: row.ResolvedAt,
		})
	}
	return out, nil
}

func (s *testManagerStore) UpsertPR(ctx context.Context, pr *StoredPullRequest) error {
	return s.raw.UpsertPR(ctx, &localdb.WorkspacePullRequest{
		ID: pr.ID, WorkspaceID: pr.WorkspaceID, OrganizationID: pr.OrganizationID,
		PRID: pr.PRID, Title: pr.Title, URL: pr.URL, Branch: pr.Branch,
		BaseBranch: pr.BaseBranch, State: pr.State, Metadata: pr.Metadata,
		DetectedAt: pr.DetectedAt, ResolvedAt: pr.ResolvedAt,
	})
}

func (s *testManagerStore) ResolvePR(ctx context.Context, workspaceID string, pullRequestID string) error {
	return s.raw.ResolvePR(ctx, workspaceID, pullRequestID)
}
