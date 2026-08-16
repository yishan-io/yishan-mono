package db

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func openCleanupStoreTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return database
}

func TestWorkspaceCleanupStore_AddListRemove(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	store, err := NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	item := PendingWorkspaceCleanup{
		WorkspaceID:   "workspace-1",
		Path:          "/tmp/ws-1",
		Branch:        "feat/x",
		RemoveBranch:  true,
		ForceWorktree: true,
		PostHook:      "hook",
	}
	if err := store.Add(item); err != nil {
		t.Fatalf("add: %v", err)
	}

	items, err := store.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	got := items[0]
	if got.WorkspaceID != item.WorkspaceID || got.Path != item.Path || got.Branch != item.Branch {
		t.Fatalf("unexpected item: %+v", got)
	}
	if !got.RemoveBranch || !got.ForceWorktree || got.PostHook != "hook" {
		t.Fatalf("expected booleans/hook preserved, got %+v", got)
	}
	if got.CreatedAt == "" || got.UpdatedAt == "" {
		t.Fatalf("expected timestamps set, got %+v", got)
	}

	if err := store.Remove(item.WorkspaceID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	items, err = store.List()
	if err != nil {
		t.Fatalf("list after remove: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected 0 items after remove, got %d", len(items))
	}
}

func TestWorkspaceCleanupStore_AddPreservesRetryHistory(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	store, err := NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if err := store.Add(PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: "/tmp/ws-1"}); err != nil {
		t.Fatalf("first add: %v", err)
	}
	if err := store.MarkFailure("workspace-1", errors.New("boom")); err != nil {
		t.Fatalf("mark failure: %v", err)
	}

	// Re-adding the same workspace must preserve attempts and last_error.
	if err := store.Add(PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: "/tmp/ws-1", Branch: "feat/y"}); err != nil {
		t.Fatalf("second add: %v", err)
	}
	items, err := store.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].Attempts != 1 || items[0].LastError != "boom" {
		t.Fatalf("expected retry history preserved, got %+v", items[0])
	}
	if items[0].Branch != "feat/y" {
		t.Fatalf("expected updated branch, got %q", items[0].Branch)
	}
}

func TestWorkspaceCleanupStore_MarkFailureIncrementsAttempts(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	store, err := NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if err := store.Add(PendingWorkspaceCleanup{WorkspaceID: "workspace-1", Path: "/tmp/ws-1"}); err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := store.MarkFailure("workspace-1", errors.New("first")); err != nil {
		t.Fatalf("first failure: %v", err)
	}
	if err := store.MarkFailure("workspace-1", errors.New("second")); err != nil {
		t.Fatalf("second failure: %v", err)
	}
	items, err := store.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if items[0].Attempts != 2 || items[0].LastError != "second" {
		t.Fatalf("expected attempts=2 lastError=second, got %+v", items[0])
	}
}

func TestWorkspaceCleanupStore_ImportsLegacyFileAndDeletesIt(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	legacyPath := filepath.Join(t.TempDir(), PendingCleanupFileName)
	legacyContent := `{
  "items": [
    {"workspaceId": "ws-legacy-1", "path": "/tmp/legacy-1", "attempts": 3, "lastError": "retried", "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"}
  ]
}`
	if err := os.WriteFile(legacyPath, []byte(legacyContent), 0o600); err != nil {
		t.Fatalf("write legacy file: %v", err)
	}

	store, err := NewWorkspaceCleanupStore(database, legacyPath)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("expected legacy file to be removed after import")
	}

	items, err := store.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 imported item, got %d", len(items))
	}
	if items[0].WorkspaceID != "ws-legacy-1" || items[0].Path != "/tmp/legacy-1" {
		t.Fatalf("unexpected imported item: %+v", items[0])
	}
	if items[0].Attempts != 3 || items[0].LastError != "retried" {
		t.Fatalf("expected retry history imported, got %+v", items[0])
	}
}

func TestWorkspaceCleanupStore_MissingLegacyFileIsFine(t *testing.T) {
	database := openCleanupStoreTestDB(t)
	store, err := NewWorkspaceCleanupStore(database, filepath.Join(t.TempDir(), PendingCleanupFileName))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	items, err := store.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected no items, got %d", len(items))
	}
}
