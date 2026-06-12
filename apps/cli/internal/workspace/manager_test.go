package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

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
