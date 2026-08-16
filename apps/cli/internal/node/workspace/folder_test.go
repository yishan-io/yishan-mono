package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// newFolderHandler builds a Service wired to an in-memory(disk-backed)
// migrated database so folder RPC handlers can persist rows.
func newFolderHandler(t *testing.T) (*Service, *localdb.WorkspaceStore) {
	t.Helper()
	s := newTestHandler(t)
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	s.setTestDatabase(database)
	return s, localdb.NewWorkspaceStore(database)
}

func TestHandleWorkspaceCreateLocalFolder_HappyPath(t *testing.T) {
	s, store := newFolderHandler(t)
	folderPath := t.TempDir()

	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: folderPath})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params)
	if err != nil {
		t.Fatalf("create local folder: %v", err)
	}
	row, ok := result.(localdb.Workspace)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if row.ID == "" || row.LocalPath == "" || row.NodeID != "node-1" || row.Kind != "folder" {
		t.Fatalf("unexpected folder row: %#v", row)
	}
	resolved, err := filepath.EvalSymlinks(folderPath)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}
	abs, err := filepath.Abs(resolved)
	if err != nil {
		t.Fatalf("abs: %v", err)
	}
	if row.LocalPath != abs {
		t.Fatalf("row path = %q, want %q", row.LocalPath, abs)
	}
	stored, err := store.Get(context.Background(), row.ID)
	if err != nil {
		t.Fatalf("get stored folder: %v", err)
	}
	if stored.Kind != "folder" || stored.LocalPath != abs {
		t.Fatalf("unexpected stored folder: %#v", stored)
	}
}

func TestHandleWorkspaceCreateLocalFolder_RejectsEmptyPath(t *testing.T) {
	s, _ := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: "   "})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestHandleWorkspaceCreateLocalFolder_RejectsNonexistentPath(t *testing.T) {
	s, _ := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: filepath.Join(t.TempDir(), "does-not-exist")})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestHandleWorkspaceCreateLocalFolder_RejectsFilePath(t *testing.T) {
	s, _ := newFolderHandler(t)
	filePath := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(filePath, []byte("x"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: filePath})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err == nil {
		t.Fatal("expected error for file path (not a directory)")
	}
}

func TestHandleWorkspaceCreateLocalFolder_RejectsGitRepository(t *testing.T) {
	s, store := newFolderHandler(t)
	repoPath := t.TempDir()
	initDispatchWorkspaceTestGitRepoWithCommit(t, repoPath)

	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: repoPath})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err == nil {
		t.Fatal("expected error for git repository folder")
	}
	// Ensure nothing was persisted for the rejected git folder.
	folders, err := store.ListFolders(context.Background())
	if err != nil {
		t.Fatalf("list folders: %v", err)
	}
	if len(folders) != 0 {
		t.Fatalf("expected no folder rows, got %d", len(folders))
	}
}

func TestHandleWorkspaceCreateLocalFolder_RejectsDuplicatePath(t *testing.T) {
	s, _ := newFolderHandler(t)
	folderPath := t.TempDir()
	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: folderPath})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params); err == nil {
		t.Fatal("expected error for duplicate path")
	}
}

func TestHandleWorkspaceListLocalFolders_ReturnsOnlyFolders(t *testing.T) {
	s, store := newFolderHandler(t)
	if _, err := store.CreateFolder(context.Background(), localdb.FolderWorkspaceInput{LocalPath: t.TempDir(), NodeID: "node-1"}); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	// Add a normal worktree row that must NOT appear in the folder list.
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create worktree row: %v", err)
	}

	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceListLocalFolders, json.RawMessage{})
	if err != nil {
		t.Fatalf("list local folders: %v", err)
	}
	rows, ok := result.([]localdb.Workspace)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if len(rows) != 1 {
		t.Fatalf("expected exactly 1 folder row, got %d", len(rows))
	}
	if rows[0].Kind != "folder" {
		t.Fatalf("expected folder kind, got %q", rows[0].Kind)
	}
}

func TestHandleWorkspaceDeleteLocalFolder_RemovesRow(t *testing.T) {
	s, store := newFolderHandler(t)
	created, err := store.CreateFolder(context.Background(), localdb.FolderWorkspaceInput{LocalPath: t.TempDir(), NodeID: "node-1"})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	params, err := json.Marshal(rpc.WorkspaceDeleteLocalFolderParams{ID: created.ID})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceDeleteLocalFolder, params)
	if err != nil {
		t.Fatalf("delete local folder: %v", err)
	}
	if _, ok := result.(map[string]any); !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if _, err := store.Get(context.Background(), created.ID); err == nil {
		t.Fatal("expected row to be deleted")
	}
}

func TestHandleWorkspaceDeleteLocalFolder_TearsDownOpenFolder(t *testing.T) {
	s, store := newFolderHandler(t)
	folderPath := t.TempDir()
	created, err := store.CreateFolder(context.Background(), localdb.FolderWorkspaceInput{LocalPath: folderPath, NodeID: "node-1"})
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	// Simulate the folder being open in the runtime manager after a desktop
	// openProject warmup so the delete teardown branch (watcher + PR tracker)
	// is exercised. Folders are strictly non-git so no real watcher is ever
	// registered, but the manager entry means the delete path must still run
	// the same teardown calls the workspace-close flow uses without panic.
	if _, err := s.Open(workspace.OpenRequest{ID: created.ID, Path: folderPath}); err != nil {
		t.Fatalf("open folder in manager: %v", err)
	}
	if _, err := s.GetWorkspace(created.ID); err != nil {
		t.Fatalf("folder should be open in manager: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceDeleteLocalFolderParams{ID: created.ID})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceDeleteLocalFolder, params); err != nil {
		t.Fatalf("delete local folder: %v", err)
	}

	if _, err := s.GetWorkspace(created.ID); err == nil {
		t.Fatal("expected folder to be removed from the manager")
	}
	if _, err := store.Get(context.Background(), created.ID); err == nil {
		t.Fatal("expected row to be deleted")
	}
}

func TestHandleWorkspaceDeleteLocalFolder_UnknownID(t *testing.T) {
	s, _ := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceDeleteLocalFolderParams{ID: "does-not-exist"})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	// Per Delete convention an unknown id returns a not-found error.
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceDeleteLocalFolder, params); err == nil {
		t.Fatal("expected error for unknown id")
	}
}

func TestHandleWorkspaceDeleteLocalFolder_RejectsEmptyID(t *testing.T) {
	s, _ := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceDeleteLocalFolderParams{ID: ""})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceDeleteLocalFolder, params); err == nil {
		t.Fatal("expected error for empty id")
	}
}

func TestHandleWorkspaceCreateLocalFolder_PersistsName(t *testing.T) {
	s, store := newFolderHandler(t)

	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{
		Path: t.TempDir(),
		Name: "  Marketing Site  ",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params)
	if err != nil {
		t.Fatalf("create local folder: %v", err)
	}
	row, ok := result.(localdb.Workspace)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if row.Name == nil || *row.Name != "Marketing Site" {
		t.Fatalf("expected trimmed name on create result, got %#v", row.Name)
	}

	stored, err := store.Get(context.Background(), row.ID)
	if err != nil {
		t.Fatalf("get stored folder: %v", err)
	}
	if stored.Name == nil || *stored.Name != "Marketing Site" {
		t.Fatalf("expected stored folder name, got %#v", stored.Name)
	}
}

func TestHandleWorkspaceCreateLocalFolder_EmptyNameIsNil(t *testing.T) {
	s, store := newFolderHandler(t)

	params, err := json.Marshal(rpc.WorkspaceCreateLocalFolderParams{Path: t.TempDir(), Name: "   "})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreateLocalFolder, params)
	if err != nil {
		t.Fatalf("create local folder: %v", err)
	}
	row, ok := result.(localdb.Workspace)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	stored, err := store.Get(context.Background(), row.ID)
	if err != nil {
		t.Fatalf("get stored folder: %v", err)
	}
	if stored.Name != nil {
		t.Fatalf("expected nil stored name for blank input, got %#v", stored.Name)
	}
}

func TestIsFolderPathUniqueViolation_DetectsRealSQLiteError(t *testing.T) {
	realErr := "create folder workspace: constraint failed: UNIQUE constraint failed: workspaces.local_path (2067)"
	if !isFolderPathUniqueViolation(errors.New(realErr)) {
		t.Fatal("expected real SQLite folder-path unique error to be detected")
	}
	if isFolderPathUniqueViolation(nil) {
		t.Fatal("expected nil to not be a unique violation")
	}
	if isFolderPathUniqueViolation(errors.New("create workspace: some other error")) {
		t.Fatal("expected unrelated error to not be a unique violation")
	}
}
