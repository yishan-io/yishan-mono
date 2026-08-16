package memory

import (
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
	db.UpsertFile(MemoryFile{
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

	err = ro.UpsertFile(MemoryFile{
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
	db, err := OpenReadOnly(filepath.Join(t.TempDir(), "nonexistent.db"))
	if err != nil {
		t.Fatalf("OpenReadOnly: %v", err)
	}
	defer db.Close()

	_, err = db.SearchMemory(SearchInput{Query: "test", Limit: 10})
	if err == nil {
		t.Error("expected error when querying non-existent read-only database")
	}
}

// ── escapeFTS5 ────────────────────────────────────────────────────────────────
