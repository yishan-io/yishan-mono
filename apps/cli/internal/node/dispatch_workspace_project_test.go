package node

import (
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestServices_OpenProjectWorkspaceRegistersWatcherOnSkipPath(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	handler := newTestServices(t, nil, "node-1")
	if _, err := handler.nodeApp.OpenWorkspace(workspace.OpenRequest{
		ID:        "workspace-1",
		Path:      root,
		ProjectID: "project-1",
		OrgID:     "org-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	workspaceID, didOpen, err := handler.openProjectWorkspace(rpc.WorkspaceOpenProjectEntry{
		WorkspaceID:  "workspace-1",
		WorktreePath: root,
		ProjectID:    "project-1",
		OrgID:        "org-1",
	})
	if err != nil {
		t.Fatalf("openProjectWorkspace: %v", err)
	}
	if didOpen {
		t.Fatal("expected open to be skipped for already-open workspace")
	}
	if workspaceID != "workspace-1" {
		t.Fatalf("unexpected workspace id %q", workspaceID)
	}
	// The desktop warmup skips already-open workspaces; the watcher must still
	// be registered so file-change events flow (the Git Changes tab depends on
	// them).
	if !handler.nodeApp.watchers.IsWatching(root) {
		t.Fatal("expected watcher registered on openProject skip path")
	}
}
