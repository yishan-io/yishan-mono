package memory

import (
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := OpenDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// ── basic CRUD ────────────────────────────────────────────────────────────────

func TestDB_UpsertAndGet(t *testing.T) {
	db := openTestDB(t)

	file := MemoryFile{
		Path:        "/ctx/MEMORY.md",
		ProjectPath: "/ctx",
		ProjectID:   "proj-1",
		Type:        FileTypeMemory,
		Body:        "# Project Memory\n",
		Fingerprint: "abc123",
		IndexedAt:   1000,
	}
	if err := db.UpsertFile(file); err != nil {
		t.Fatalf("UpsertFile: %v", err)
	}

	got, found, err := db.GetByPath("/ctx/MEMORY.md")
	if err != nil || !found {
		t.Fatalf("GetByPath: found=%v err=%v", found, err)
	}
	if got.ProjectID != "proj-1" || got.Type != FileTypeMemory || got.Body != file.Body {
		t.Errorf("unexpected file: %+v", got)
	}
}

func TestDB_UpsertReplaces(t *testing.T) {
	db := openTestDB(t)

	f1 := MemoryFile{Path: "/ctx/MEMORY.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "v1", Fingerprint: "fp1", IndexedAt: 1}
	f2 := MemoryFile{Path: "/ctx/MEMORY.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "v2", Fingerprint: "fp2", IndexedAt: 2}

	if err := db.UpsertFile(f1); err != nil {
		t.Fatal(err)
	}
	if err := db.UpsertFile(f2); err != nil {
		t.Fatal(err)
	}

	got, _, _ := db.GetByPath("/ctx/MEMORY.md")
	if got.Body != "v2" || got.Fingerprint != "fp2" {
		t.Errorf("expected updated body=v2, got %q", got.Body)
	}
}

func TestDB_DeleteByPath(t *testing.T) {
	db := openTestDB(t)

	if err := db.UpsertFile(MemoryFile{Path: "/ctx/x.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "x", Fingerprint: "fp", IndexedAt: 1}); err != nil {
		t.Fatal(err)
	}
	if err := db.DeleteByPath("/ctx/x.md"); err != nil {
		t.Fatal(err)
	}

	_, found, _ := db.GetByPath("/ctx/x.md")
	if found {
		t.Error("expected file to be deleted")
	}
}

func TestDB_GetByPath_Missing(t *testing.T) {
	db := openTestDB(t)
	_, found, err := db.GetByPath("/nonexistent.md")
	if err != nil || found {
		t.Errorf("expected not found, got found=%v err=%v", found, err)
	}
}

func TestDB_AllPaths(t *testing.T) {
	db := openTestDB(t)

	paths := []string{"/ctx/a.md", "/ctx/b.md", "/ctx/c.md"}
	for _, p := range paths {
		if err := db.UpsertFile(MemoryFile{Path: p, ProjectPath: "/ctx", Type: FileTypeMemory, Body: "x", Fingerprint: "fp" + p, IndexedAt: 1}); err != nil {
			t.Fatal(err)
		}
	}

	all, err := db.AllPaths()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Errorf("expected 3 paths, got %d", len(all))
	}
}

// ── FTS5 search ───────────────────────────────────────────────────────────────
