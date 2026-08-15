package instance

import (
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"
)

func TestHandle_FileOperationsScopedToInstancePath(t *testing.T) {
	root := t.TempDir()
	handle := NewHandle(
		workspace.Workspace{ID: "ws-1", Path: root},
		workspace.NewFileService(),
		workspace.NewGitService(),
		terminal.NewManager(),
	)

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

	read, err := handle.FileRead("notes.txt")
	if err != nil {
		t.Fatalf("read through handle: %v", err)
	}
	if read != "hello" {
		t.Fatalf("read = %q, want hello", read)
	}
}

func TestHandle_InstanceReturnsScopedWorkspace(t *testing.T) {
	handle := NewHandle(
		workspace.Workspace{ID: "ws-1", Path: "/tmp/ws", ProjectID: "project-1"},
		workspace.NewFileService(),
		workspace.NewGitService(),
		terminal.NewManager(),
	)
	inst := handle.Instance()
	if inst.ID != "ws-1" || inst.ProjectID != "project-1" {
		t.Fatalf("instance = %#v, want ws-1/project-1", inst)
	}
}
