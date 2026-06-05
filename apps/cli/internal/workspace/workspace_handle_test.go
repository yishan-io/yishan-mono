package workspace

import (
	"path/filepath"
	"testing"
)

func TestManagerWorkspaceHandleByPath_ReturnsWorkspaceHandle(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}
	manager := NewManager()
	openedWorkspace, err := manager.Open(OpenRequest{ID: "ws-1", Path: root})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	handle, err := manager.WorkspaceHandleByPath(root)
	if err != nil {
		t.Fatalf("workspace handle by path: %v", err)
	}
	if handle.Workspace().ID != openedWorkspace.ID {
		t.Fatalf("expected workspace %q, got %+v", openedWorkspace.ID, handle.Workspace())
	}

	if _, err := handle.FileWrite("notes.txt", "hello", 0); err != nil {
		t.Fatalf("write through handle: %v", err)
	}
	entries, err := handle.FileList("", false)
	if err != nil {
		t.Fatalf("list through handle: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != filepath.ToSlash("notes.txt") {
		t.Fatalf("unexpected entries from handle: %+v", entries)
	}
}
