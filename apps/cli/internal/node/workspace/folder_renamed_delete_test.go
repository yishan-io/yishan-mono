package workspace

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestDeleteLocalFolder_RenamedDirectoryPreservesFiles(t *testing.T) {
	s, store := newFolderHandler(t)
	ctx := context.Background()
	folderPath := filepath.Join(t.TempDir(), "original")
	const sentinelName, sentinelContent = "sentinel.txt", "keep this file untouched\n"
	if err := os.Mkdir(folderPath, 0o755); err != nil {
		t.Fatalf("create folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folderPath, sentinelName), []byte(sentinelContent), 0o644); err != nil {
		t.Fatalf("write sentinel: %v", err)
	}
	folderID := importAndOpenRenamedFolderForTest(t, s, folderPath)
	renamedPath := filepath.Join(filepath.Dir(folderPath), "renamed")
	if err := os.Rename(folderPath, renamedPath); err != nil {
		t.Fatalf("rename folder: %v", err)
	}
	if _, err := os.Stat(folderPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("original path stat error = %v, want not-exist", err)
	}
	if _, err := s.DeleteLocalFolder(ctx, rpc.WorkspaceDeleteLocalFolderParams{ID: folderID}); err != nil {
		t.Fatalf("delete renamed local folder by existing ID: %v", err)
	}
	assertRenamedFolderUnregistered(t, s, store, folderID)
	if info, err := os.Stat(renamedPath); err != nil || !info.IsDir() {
		t.Fatalf("renamed directory missing or not a directory: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(renamedPath, sentinelName))
	if err != nil {
		t.Fatalf("read preserved sentinel: %v", err)
	}
	if string(content) != sentinelContent {
		t.Fatalf("sentinel content = %q, want %q", content, sentinelContent)
	}
}

func importAndOpenRenamedFolderForTest(t *testing.T, s *Service, folderPath string) string {
	t.Helper()
	imported, err := s.ImportLocalPath(context.Background(), rpc.WorkspaceImportLocalPathParams{Path: folderPath})
	if err != nil {
		t.Fatalf("import local folder: %v", err)
	}
	classification, ok := imported.(rpc.WorkspaceImportLocalPathResult)
	if !ok || classification.Kind != "folder" || classification.Folder == nil || classification.Folder.ID == "" {
		t.Fatalf("expected imported folder with ID, got %#v", imported)
	}
	folder := classification.Folder
	if _, err := s.Open(workspace.OpenRequest{ID: folder.ID, Path: folder.LocalPath, Kind: workspace.KindFolder}); err != nil {
		t.Fatalf("open folder runtime: %v", err)
	}
	if _, err := s.GetWorkspace(folder.ID); err != nil {
		t.Fatalf("folder should exist in runtime before rename: %v", err)
	}
	return folder.ID
}

func assertRenamedFolderUnregistered(t *testing.T, s *Service, store *sqlite.WorkspaceStore, folderID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := store.Get(ctx, folderID); !errors.Is(err, sqlite.ErrWorkspaceNotFound) {
		t.Fatalf("stored folder lookup error = %v, want workspace not found", err)
	}
	if _, err := s.GetWorkspace(folderID); err == nil {
		t.Fatal("expected folder to be removed from runtime")
	}
	listed, err := s.ListLocalFolders(ctx)
	if err != nil {
		t.Fatalf("list local folders: %v", err)
	}
	folders, ok := listed.([]sqlite.Workspace)
	if !ok || len(folders) != 0 {
		t.Fatalf("expected no listed folders, got %#v", listed)
	}
}
