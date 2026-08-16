package memory

import (
	"testing"
)

func TestDB_Search_BasicMatch(t *testing.T) {
	db := openTestDB(t)

	if err := db.UpsertFile(memoryFile{
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
	if err := db.UpsertFile(memoryFile{
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
	if err := db.UpsertFile(memoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", ProjectID: "p1", Type: FileTypeMemory, Body: "hello world", Fingerprint: "fp", IndexedAt: 1}); err != nil {
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
		if err := db.UpsertFile(memoryFile{
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

	upsert := func(path string, ftype fileType, body string) {
		t.Helper()
		if err := db.UpsertFile(memoryFile{Path: path, ProjectPath: "/ctx", ProjectID: "p1", Type: ftype, Body: body, Fingerprint: "fp" + path, IndexedAt: 1}); err != nil {
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

	if err := db.UpsertFile(memoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "original content here", Fingerprint: "fp1", IndexedAt: 1}); err != nil {
		t.Fatal(err)
	}
	// Update body — FTS should reflect new content.
	if err := db.UpsertFile(memoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "completely different text now", Fingerprint: "fp2", IndexedAt: 2}); err != nil {
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
		if err := db.UpsertFile(memoryFile{
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
