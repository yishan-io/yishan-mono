package daemon

import (
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

func TestRestoreIndexedWorkspaces_RestoresExistingEntries(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}
	workspacePath := t.TempDir()
	if err := indexStore.Upsert(workspaceIndexEntry{
		WorkspaceID:  "workspace-1",
		WorktreePath: workspacePath,
		ProjectID:    "project-1",
	}); err != nil {
		t.Fatalf("indexStore.Upsert: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, indexStore, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	if err := restoreIndexedWorkspaces(handler); err != nil {
		t.Fatalf("restoreIndexedWorkspaces: %v", err)
	}

	restored, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	canonicalWorkspacePath, err := filepath.EvalSymlinks(workspacePath)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	if restored.Path != canonicalWorkspacePath {
		t.Fatalf("expected restored path %q, got %q", canonicalWorkspacePath, restored.Path)
	}
	if restored.ProjectID != "project-1" {
		t.Fatalf("expected restored project id %q, got %q", "project-1", restored.ProjectID)
	}
	if len(manager.List()) != 1 {
		t.Fatalf("expected one restored workspace, got %d", len(manager.List()))
	}
}

func TestRestoreIndexedWorkspaces_SkipsMissingPaths(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}
	missingPath := filepath.Join(root, "missing-workspace")
	if err := indexStore.Upsert(workspaceIndexEntry{
		WorkspaceID:  "workspace-missing",
		WorktreePath: missingPath,
		ProjectID:    "project-1",
	}); err != nil {
		t.Fatalf("indexStore.Upsert: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, indexStore, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	if err := restoreIndexedWorkspaces(handler); err != nil {
		t.Fatalf("restoreIndexedWorkspaces: %v", err)
	}

	if len(manager.List()) != 0 {
		t.Fatalf("expected no restored workspaces for missing path, got %d", len(manager.List()))
	}
	if _, err := manager.GetWorkspace("workspace-missing"); err == nil {
		t.Fatal("expected missing workspace not to be restored")
	}
}
