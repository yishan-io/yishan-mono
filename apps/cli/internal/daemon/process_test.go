package daemon

import (
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/memory"
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

func TestInitMemoryService_MigratesOldDB(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(oldPath)
	if err != nil {
		t.Fatalf("OpenDB oldPath: %v", err)
	}
	db.Close()

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, statePath, cfg); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to be moved away")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemoryService_NewPathOnly(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, statePath, cfg); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to not exist")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemoryService_BothExistKeepsOld(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(newPath)
	if err != nil {
		t.Fatalf("OpenDB newPath: %v", err)
	}
	db.Close()

	if err := os.WriteFile(oldPath, []byte("old-db"), 0o600); err != nil {
		t.Fatalf("WriteFile oldPath: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	cfg := RunConfig{}
	if err := initMemoryService(handler, statePath, cfg); err != nil {
		t.Fatalf("initMemoryService: %v", err)
	}

	data, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatalf("expected old memory.db to still exist: %v", err)
	}
	if string(data) != "old-db" {
		t.Fatalf("expected old db unchanged, got %q", string(data))
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}
