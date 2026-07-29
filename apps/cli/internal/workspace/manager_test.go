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
	projectStore := localdb.NewProjectStore(database)
	project := localdb.Project{ID: "project-1", Name: "Project", OrganizationID: "org-1", ContextEnabled: true}
	if err := projectStore.Create(context.Background(), &project); err != nil {
		t.Fatalf("create project: %v", err)
	}
	workspacePath := t.TempDir()
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: project.ID, NodeID: "node-1",
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
	if workspace.Path != canonicalWorkspacePath || workspace.ProjectID != project.ID {
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
