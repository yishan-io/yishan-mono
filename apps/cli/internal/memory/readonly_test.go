package memory

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
)

func TestOpenReadOnly_SearchWorks(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	db.UpsertFile(memoryFile{
		Path:        "/ctx/MEMORY.md",
		ProjectPath: "/ctx",
		ProjectID:   "proj-1",
		Type:        FileTypeMemory,
		Body:        "authentication module uses JWT tokens",
		Fingerprint: "abc123",
		IndexedAt:   1000,
	})
	db.Close()

	ro, err := OpenReadOnly(dbPath)
	if err != nil {
		t.Fatalf("OpenReadOnly: %v", err)
	}
	defer ro.Close()

	results, err := ro.SearchMemory(SearchInput{Query: "authentication", Limit: 10})
	if err != nil {
		t.Fatalf("SearchMemory: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Path != "/ctx/MEMORY.md" {
		t.Errorf("expected /ctx/MEMORY.md, got %s", results[0].Path)
	}
}

func TestOpenReadOnly_RejectsWrites(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")

	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	db.Close()

	ro, err := OpenReadOnly(dbPath)
	if err != nil {
		t.Fatalf("OpenReadOnly: %v", err)
	}
	defer ro.Close()

	err = ro.UpsertFile(memoryFile{
		Path:        "/ctx/test.md",
		ProjectPath: "/ctx",
		Type:        FileTypeMemory,
		Body:        "test",
		Fingerprint: "fp",
		IndexedAt:   1,
	})
	if err == nil {
		t.Error("expected UpsertFile to fail in read-only mode")
	}
}

func TestOpenReadOnly_RejectsMissingFile(t *testing.T) {
	_, err := OpenReadOnly(filepath.Join(t.TempDir(), "nonexistent.db"))
	if err == nil {
		t.Error("expected error when opening a non-existent read-only database")
	}
}

func TestOpenReadOnly_OldSchemaRequiresWritableReconcileUpgrade(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "old.db")
	seedOldMemorySchema(t, dbPath)
	if _, err := OpenReadOnly(dbPath); !errors.Is(err, ErrSchemaMigrationRequired) {
		t.Fatalf("OpenReadOnly error = %v, want migration required", err)
	}
	writable, err := OpenDB(dbPath)
	if err != nil {
		t.Fatalf("OpenDB upgrade: %v", err)
	}
	if err := writable.Close(); err != nil {
		t.Fatal(err)
	}
	readOnly, err := OpenReadOnly(dbPath)
	if err != nil {
		t.Fatalf("OpenReadOnly after upgrade: %v", err)
	}
	defer readOnly.Close()
}

func seedOldMemorySchema(t *testing.T, dbPath string) {
	t.Helper()
	database, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	_, err = database.Exec(`CREATE TABLE memory_files (
		id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT UNIQUE NOT NULL,
		project_path TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '', type TEXT NOT NULL,
		body TEXT NOT NULL, fingerprint TEXT NOT NULL, indexed_at INTEGER NOT NULL);
		CREATE VIRTUAL TABLE memory_fts USING fts5(path, type, body, content='memory_files', content_rowid='id');`)
	if err != nil {
		t.Fatal(err)
	}
}

// ── escapeFTS5 ────────────────────────────────────────────────────────────────
