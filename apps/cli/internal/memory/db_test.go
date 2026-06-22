package memory

import (
	"os"
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

func TestDB_Search_BasicMatch(t *testing.T) {
	db := openTestDB(t)

	if err := db.UpsertFile(MemoryFile{
		Path:        "/ctx/MEMORY.md",
		ProjectPath: "/ctx",
		ProjectID:   "proj-1",
		Type:        FileTypeMemory,
		Body:        "The deadlock was caused by a mutex ordering issue.",
		Fingerprint: "fp1",
		IndexedAt:   1,
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.UpsertFile(MemoryFile{
		Path:        "/ctx/architecture/db.md",
		ProjectPath: "/ctx",
		ProjectID:   "proj-1",
		Type:        FileTypeArchitecture,
		Body:        "Use postgres for all persistent storage.",
		Fingerprint: "fp2",
		IndexedAt:   1,
	}); err != nil {
		t.Fatal(err)
	}

	results, err := db.Search("deadlock", "proj-1", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Path != "/ctx/MEMORY.md" {
		t.Errorf("unexpected path: %q", results[0].Path)
	}
}

func TestDB_Search_NoMatch(t *testing.T) {
	db := openTestDB(t)
	if err := db.UpsertFile(MemoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", ProjectID: "p1", Type: FileTypeMemory, Body: "hello world", Fingerprint: "fp", IndexedAt: 1}); err != nil {
		t.Fatal(err)
	}
	results, err := db.Search("caveman", "p1", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Errorf("expected no results, got %d", len(results))
	}
}

func TestDB_Search_ProjectIDFilter(t *testing.T) {
	db := openTestDB(t)

	for _, pid := range []string{"proj-a", "proj-b"} {
		if err := db.UpsertFile(MemoryFile{
			Path:        "/ctx/" + pid + "/MEMORY.md",
			ProjectPath: "/ctx/" + pid,
			ProjectID:   pid,
			Type:        FileTypeMemory,
			Body:        "authentication token refresh logic",
			Fingerprint: "fp-" + pid,
			IndexedAt:   1,
		}); err != nil {
			t.Fatal(err)
		}
	}

	results, err := db.Search("authentication", "proj-a", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Path != "/ctx/proj-a/MEMORY.md" {
		t.Errorf("project filter failed: %v", results)
	}
}

func TestDB_Search_TypeFilter(t *testing.T) {
	db := openTestDB(t)

	upsert := func(path string, ftype FileType, body string) {
		t.Helper()
		if err := db.UpsertFile(MemoryFile{Path: path, ProjectPath: "/ctx", ProjectID: "p1", Type: ftype, Body: body, Fingerprint: "fp" + path, IndexedAt: 1}); err != nil {
			t.Fatal(err)
		}
	}
	upsert("/ctx/MEMORY.md", FileTypeMemory, "sqlite fts5 setup notes")
	upsert("/ctx/architecture/db.md", FileTypeArchitecture, "sqlite fts5 setup notes")

	results, err := db.Search("sqlite", "", FileTypeArchitecture, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Path != "/ctx/architecture/db.md" {
		t.Errorf("type filter failed: %v", results)
	}
}

func TestDB_Search_FTSTriggerSync(t *testing.T) {
	// Verify that the FTS triggers keep the index in sync after UPDATE and DELETE.
	db := openTestDB(t)

	if err := db.UpsertFile(MemoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "original content here", Fingerprint: "fp1", IndexedAt: 1}); err != nil {
		t.Fatal(err)
	}
	// Update body — FTS should reflect new content.
	if err := db.UpsertFile(MemoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "completely different text now", Fingerprint: "fp2", IndexedAt: 2}); err != nil {
		t.Fatal(err)
	}

	// Old term should no longer match.
	old, err := db.Search("original", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(old) != 0 {
		t.Errorf("expected stale FTS entry to be gone after update, got %d results", len(old))
	}

	// New term should match.
	newR, err := db.Search("different", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(newR) != 1 {
		t.Errorf("expected updated FTS entry to match, got %d results", len(newR))
	}

	// Delete — FTS should reflect removal.
	if err := db.DeleteByPath("/ctx/a.md"); err != nil {
		t.Fatal(err)
	}
	after, err := db.Search("different", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 0 {
		t.Errorf("expected deleted entry to be gone from FTS, got %d results", len(after))
	}
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

func TestReconcile_InsertNewFiles(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	if err := os.MkdirAll(ctxDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("# Memory\n"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "notes.md"), []byte("# Notes\n"), 0o644)

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree, ProjectID: "p1"}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 2 {
		t.Errorf("expected 2 inserted, got %d", result.Inserted)
	}
	if result.Updated != 0 || result.Deleted != 0 {
		t.Errorf("unexpected updated=%d deleted=%d", result.Updated, result.Deleted)
	}
}

func TestReconcile_UpdateChangedFile(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	os.WriteFile(memPath, []byte("v1"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	// Change content.
	os.WriteFile(memPath, []byte("v2 updated"), 0o644)
	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Updated != 1 {
		t.Errorf("expected 1 updated, got %d", result.Updated)
	}
}

func TestReconcile_DeleteRemovedFile(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	deletedPath := filepath.Join(ctxDir, "todelete.md")
	os.WriteFile(deletedPath, []byte("will be deleted"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "keep.md"), []byte("keep"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	os.Remove(deletedPath)

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 1 {
		t.Errorf("expected 1 deleted, got %d", result.Deleted)
	}

	_, found, _ := db.GetByPath(deletedPath)
	if found {
		t.Error("deleted file should not be in DB")
	}
}

func TestReconcile_SkipUnchanged(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("unchanged"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 0 || result.Updated != 0 || result.Deleted != 0 {
		t.Errorf("expected all zeros on second reconcile of unchanged files, got %+v", result)
	}
}

func TestReconcile_ClassifiesTypes(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(filepath.Join(ctxDir, "architecture"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "archive"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "tasks", "t001"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "future-improvement"), 0o755)

	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("memory"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "architecture", "decisions.md"), []byte("arch"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "archive", "decisions-20260614.md"), []byte("overflow"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "tasks", "t001", "plan.md"), []byte("task"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "future-improvement", "idea.md"), []byte("future"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree, ProjectID: "p1"}}, "")

	// resolveContextRoot returns ctxDir directly since it's a real dir (not a symlink) in tests.
	ctxRoot := resolveContextRoot(worktree)
	if ctxRoot == "" {
		t.Fatal("resolveContextRoot returned empty for test worktree")
	}

	cases := []struct {
		relPath string
		want    FileType
	}{
		{"MEMORY.md", FileTypeMemory},
		{filepath.Join("architecture", "decisions.md"), FileTypeArchitecture},
		{filepath.Join("archive", "decisions-20260614.md"), FileTypeArchive},
		{filepath.Join("tasks", "t001", "plan.md"), FileTypeTask},
		{filepath.Join("future-improvement", "idea.md"), FileTypeFuture},
	}

	for _, tc := range cases {
		fullPath := filepath.Join(ctxRoot, tc.relPath)
		f, found, err := db.GetByPath(fullPath)
		if err != nil || !found {
			t.Errorf("file %q not found: err=%v", fullPath, err)
			continue
		}
		if f.Type != tc.want {
			t.Errorf("file %q: type=%q, want %q", fullPath, f.Type, tc.want)
		}
	}
}

func TestReconcile_GlobalDir(t *testing.T) {
	db := openTestDB(t)
	globalDir := t.TempDir()
	globalMemPath := filepath.Join(globalDir, "MEMORY.md")
	os.WriteFile(globalMemPath, []byte("global memory"), 0o644)

	result, err := db.Reconcile(nil, globalDir)
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 1 {
		t.Errorf("expected 1 global file inserted, got %d", result.Inserted)
	}

	f, found, _ := db.GetByPath(globalMemPath)
	if !found {
		t.Fatal("global file not found in DB")
	}
	if f.Type != FileTypeGlobal {
		t.Errorf("expected FileTypeGlobal, got %q", f.Type)
	}
	if f.ProjectID != "" {
		t.Errorf("expected empty projectID for global, got %q", f.ProjectID)
	}
}

// ── IndexFileOnDisk ───────────────────────────────────────────────────────────

func TestIndexFileOnDisk_NewFile(t *testing.T) {
	db := openTestDB(t)
	ctxDir := t.TempDir()
	p := filepath.Join(ctxDir, "MEMORY.md")
	os.WriteFile(p, []byte("# Memory"), 0o644)

	if err := db.IndexFileOnDisk(p, ctxDir, "proj-1"); err != nil {
		t.Fatal(err)
	}

	f, found, _ := db.GetByPath(p)
	if !found {
		t.Fatal("file not in DB after IndexFileOnDisk")
	}
	if f.ProjectID != "proj-1" {
		t.Errorf("expected proj-1, got %q", f.ProjectID)
	}
}

func TestIndexFileOnDisk_DeletesOnNotExist(t *testing.T) {
	db := openTestDB(t)
	p := "/nonexistent/MEMORY.md"
	db.UpsertFile(MemoryFile{Path: p, ProjectPath: "/nonexistent", Type: FileTypeMemory, Body: "x", Fingerprint: "fp", IndexedAt: 1})

	if err := db.IndexFileOnDisk(p, "/nonexistent", "p1"); err != nil {
		t.Fatal(err)
	}
	_, found, _ := db.GetByPath(p)
	if found {
		t.Error("file should be deleted when not on disk")
	}
}

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

func TestEscapeFTS5(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"", `""`},
		{"deadlock", `"deadlock"`},
		{"permission deadlock", `"permission" OR "deadlock"`},
		{"a b c", `"a" OR "b" OR "c"`},
		// Internal double-quote must be escaped as two double-quotes.
		// strings.Fields splits `say "hi"` into tokens [say, "hi"], so "hi"
		// (including its surrounding quotes) becomes a token whose quotes are doubled.
		{`say "hi"`, `"say" OR """hi"""`},
		// Extra whitespace is collapsed by strings.Fields.
		{"  foo   bar  ", `"foo" OR "bar"`},
	}
	for _, tc := range cases {
		got := escapeFTS5(tc.input)
		if got != tc.want {
			t.Errorf("escapeFTS5(%q) = %q; want %q", tc.input, got, tc.want)
		}
	}
}

func TestDB_Search_MultiWordORQuery(t *testing.T) {
	// Regression: multi-word queries previously returned zero results because
	// escapeFTS5 wrapped the whole string as a phrase match.
	// Now each token is OR-joined so either word independently triggers a hit.
	db := openTestDB(t)

	upsert := func(path, body string) {
		t.Helper()
		if err := db.UpsertFile(MemoryFile{
			Path: path, ProjectPath: "/ctx", ProjectID: "p1",
			Type: FileTypeMemory, Body: body, Fingerprint: path, IndexedAt: 1,
		}); err != nil {
			t.Fatal(err)
		}
	}
	upsert("/ctx/a.md", "The permission check failed due to missing role.")
	upsert("/ctx/b.md", "A deadlock was introduced by the mutex ordering.")

	// "permission deadlock" must match both docs (OR semantics), not zero.
	results, err := db.Search("permission deadlock", "p1", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 results for multi-word OR query, got %d", len(results))
	}
}
