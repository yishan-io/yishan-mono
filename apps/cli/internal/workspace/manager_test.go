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
