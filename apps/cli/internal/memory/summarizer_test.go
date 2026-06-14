package memory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── parseMemorySections ───────────────────────────────────────────────────────

func TestParseMemorySections_FullFile(t *testing.T) {
	content := `# Project Memory

_Last updated: 2026-06-14_

## Where I Left Off

Working on the memory system. Implementing FTS5 indexing.

## My Decisions

- 2026-06-14 — Used modernc.org/sqlite for CGo-free SQLite
- 2026-06-13 — Stored memory.db in profile directory

## What I Learned

- 2026-06-14 — FTS5 content tables require manual trigger sync
- 2026-06-13 — .my-context is a symlink to contexts/<repoKey>
`

	s := parseMemorySections(content)

	if !strings.Contains(s.LeaveOff, "memory system") {
		t.Errorf("LeaveOff should contain prose, got: %q", s.LeaveOff)
	}
	if len(s.Decisions) != 2 {
		t.Errorf("expected 2 decisions, got %d", len(s.Decisions))
	}
	if len(s.Learned) != 2 {
		t.Errorf("expected 2 learned, got %d", len(s.Learned))
	}
	if len(s.Errors) != 0 {
		t.Errorf("expected 0 errors, got %d", len(s.Errors))
	}
}

func TestParseMemorySections_ProseLeaveOff(t *testing.T) {
	content := `## Where I Left Off

First line of prose.
Second line of prose.

## My Decisions
`
	s := parseMemorySections(content)
	if !strings.Contains(s.LeaveOff, "First line") || !strings.Contains(s.LeaveOff, "Second line") {
		t.Errorf("LeaveOff should preserve both prose lines, got: %q", s.LeaveOff)
	}
}

func TestParseMemorySections_Empty(t *testing.T) {
	s := parseMemorySections("")
	if s.LeaveOff != "" || len(s.Decisions) != 0 || len(s.Learned) != 0 {
		t.Error("empty content should produce empty sections")
	}
}

func TestParseMemorySections_ErrorsSection(t *testing.T) {
	content := `## Errors

- 2026-06-14 — null pointer dereference — added nil check
`
	s := parseMemorySections(content)
	if len(s.Errors) != 1 {
		t.Errorf("expected 1 error, got %d", len(s.Errors))
	}
}

// ── buildMemoryMarkdown ───────────────────────────────────────────────────────

func TestBuildMemoryMarkdown_RoundTrip(t *testing.T) {
	sections := memorySections{
		LeaveOff:  "Working on authentication",
		Decisions: []string{"2026-06-14 — Used JWT"},
		Learned:   []string{"2026-06-14 — JWT expiry is 1h"},
		Errors:    []string{},
	}
	md := buildMemoryMarkdown(sections)

	if !strings.Contains(md, "# Project Memory") {
		t.Error("missing header")
	}
	if !strings.Contains(md, "Working on authentication") {
		t.Error("missing leaveOff")
	}
	if !strings.Contains(md, "- 2026-06-14 — Used JWT") {
		t.Error("missing decision")
	}
	if !strings.Contains(md, "- 2026-06-14 — JWT expiry is 1h") {
		t.Error("missing learned")
	}
}

// ── containsEntry ─────────────────────────────────────────────────────────────

func TestContainsEntry(t *testing.T) {
	entries := []string{"foo bar baz", "hello world"}

	if !containsEntry(entries, "foo bar baz") {
		t.Error("exact match should return true")
	}
	if !containsEntry(entries, "  FOO BAR BAZ  ") {
		t.Error("case-insensitive trimmed match should return true")
	}
	if containsEntry(entries, "not found") {
		t.Error("missing entry should return false")
	}
	if containsEntry(nil, "anything") {
		t.Error("nil slice should return false")
	}
}

// ── parseExtractedJSON ────────────────────────────────────────────────────────

func TestParseExtractedJSON_Valid(t *testing.T) {
	raw := `{
		"decisions": ["2026-06-14 — Used SQLite — lightweight"],
		"learned": ["2026-06-14 — FTS5 requires triggers"],
		"errors": ["2026-06-14 — nil panic — added guard"],
		"leaveOff": "Working on FTS indexing"
	}`

	k, err := parseExtractedJSON(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(k.Decisions) != 1 {
		t.Errorf("expected 1 decision, got %d", len(k.Decisions))
	}
	if len(k.Learned) != 1 {
		t.Errorf("expected 1 learned, got %d", len(k.Learned))
	}
	if len(k.Errors) != 1 {
		t.Errorf("expected 1 error, got %d", len(k.Errors))
	}
	if k.LeaveOff != "Working on FTS indexing" {
		t.Errorf("unexpected leaveOff: %q", k.LeaveOff)
	}
}

func TestParseExtractedJSON_StrippedFences(t *testing.T) {
	// LLM sometimes wraps in markdown fences — parser should handle it.
	raw := "```json\n{\"decisions\":[],\"learned\":[],\"errors\":[],\"leaveOff\":\"\"}\n```"
	_, err := parseExtractedJSON(raw)
	if err != nil {
		t.Fatalf("should handle stripped fences, got: %v", err)
	}
}

func TestParseExtractedJSON_InvalidJSON(t *testing.T) {
	_, err := parseExtractedJSON("not json at all")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParseExtractedJSON_EmptyArrays(t *testing.T) {
	k, err := parseExtractedJSON(`{"decisions":[],"learned":[],"errors":[],"leaveOff":""}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(k.Decisions) != 0 || len(k.Learned) != 0 || len(k.Errors) != 0 {
		t.Error("expected all empty slices")
	}
}

// ── mergeAndWrite ─────────────────────────────────────────────────────────────

func TestMergeAndWrite_AppendsNewEntries(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	existing := `# Project Memory

## Where I Left Off

Existing work.

## My Decisions

- 2026-06-13 — Old decision

## What I Learned

- 2026-06-13 — Old learning
`
	os.WriteFile(memPath, []byte(existing), 0o644)

	extracted := ExtractedKnowledge{
		Decisions: []string{"2026-06-14 — New decision"},
		Learned:   []string{"2026-06-14 — New learning"},
		LeaveOff:  "Updated work",
	}

	written, err := mergeAndWrite(memPath, existing, extracted, ctxDir)
	if err != nil {
		t.Fatalf("mergeAndWrite: %v", err)
	}
	if len(written) == 0 {
		t.Fatal("expected at least one written path")
	}

	result, _ := os.ReadFile(memPath)
	content := string(result)

	if !strings.Contains(content, "Old decision") {
		t.Error("should preserve existing decisions")
	}
	if !strings.Contains(content, "New decision") {
		t.Error("should append new decisions")
	}
	if !strings.Contains(content, "Old learning") {
		t.Error("should preserve existing learned")
	}
	if !strings.Contains(content, "New learning") {
		t.Error("should append new learned")
	}
	if !strings.Contains(content, "Updated work") {
		t.Error("should update leaveOff")
	}
}

func TestMergeAndWrite_Deduplicates(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	existing := `## My Decisions

- 2026-06-14 — Existing decision
`
	os.WriteFile(memPath, []byte(existing), 0o644)

	extracted := ExtractedKnowledge{
		Decisions: []string{"2026-06-14 — Existing decision"}, // exact duplicate
	}

	mergeAndWrite(memPath, existing, extracted, ctxDir)

	result, _ := os.ReadFile(memPath)
	count := strings.Count(string(result), "Existing decision")
	if count != 1 {
		t.Errorf("expected 1 occurrence of duplicate, got %d", count)
	}
}

func TestMergeAndWrite_CreatesFile(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	// File does not exist yet.

	extracted := ExtractedKnowledge{
		Decisions: []string{"2026-06-14 — First decision"},
		LeaveOff:  "Starting fresh",
	}

	written, err := mergeAndWrite(memPath, "", extracted, ctxDir)
	if err != nil {
		t.Fatalf("mergeAndWrite on new file: %v", err)
	}
	if _, err := os.Stat(memPath); os.IsNotExist(err) {
		t.Error("MEMORY.md should have been created")
	}
	if len(written) == 0 || written[len(written)-1] != memPath {
		t.Errorf("memPath should be in written paths, got %v", written)
	}
}

func TestMergeAndWrite_LeaveOffEmptyDoesNotOverwrite(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	existing := `## Where I Left Off

Important existing context.
`
	os.WriteFile(memPath, []byte(existing), 0o644)

	extracted := ExtractedKnowledge{LeaveOff: ""} // empty — should not overwrite
	mergeAndWrite(memPath, existing, extracted, ctxDir)

	result, _ := os.ReadFile(memPath)
	if !strings.Contains(string(result), "Important existing context") {
		t.Error("existing leaveOff should be preserved when extracted.LeaveOff is empty")
	}
}

// ── checkBudget ───────────────────────────────────────────────────────────────

func TestCheckBudget_UnderLimit(t *testing.T) {
	content := strings.Repeat("x", 100)
	b := checkBudget(content, "/ctx/MEMORY.md", "/ctx")
	if b.Exceeded {
		t.Error("should not exceed budget")
	}
	if b.TrimmedContent != content {
		t.Error("unchanged content should be returned as-is")
	}
	if len(b.OverflowPaths) != 0 {
		t.Error("no overflow paths expected")
	}
}

func TestCheckBudget_GlobalLimit(t *testing.T) {
	// Global memory has a lower limit (1000 chars).
	content := strings.Repeat("x", MaxGlobalMemoryChars+1)
	b := checkBudget(content, "/home/user/.yishan/memory/global/MEMORY.md", "")
	if !b.Exceeded {
		t.Error("should exceed global budget")
	}
	if b.Limit != MaxGlobalMemoryChars {
		t.Errorf("expected global limit %d, got %d", MaxGlobalMemoryChars, b.Limit)
	}
	// No overflow target for global — OverflowPaths should be empty.
	if len(b.OverflowPaths) != 0 {
		t.Errorf("global memory should have no overflow paths, got %v", b.OverflowPaths)
	}
}

func TestCheckBudget_ProjectLimit(t *testing.T) {
	content := strings.Repeat("x", MaxProjectMemoryChars+1)
	b := checkBudget(content, "/ctx/MEMORY.md", "")
	if !b.Exceeded {
		t.Error("should exceed project budget")
	}
	if b.Limit != MaxProjectMemoryChars {
		t.Errorf("expected project limit %d, got %d", MaxProjectMemoryChars, b.Limit)
	}
}

// ── overflowEntries ───────────────────────────────────────────────────────────

func TestOverflowEntries_WritesFile(t *testing.T) {
	ctxDir := t.TempDir()
	entries := []string{"decision one", "decision two"}

	path := overflowEntries(ctxDir, "decisions", entries)

	if path == "" {
		t.Fatal("expected a non-empty path to be returned")
	}
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("overflow file should exist on disk")
	}
	data, _ := os.ReadFile(path)
	content := string(data)
	if !strings.Contains(content, "decision one") || !strings.Contains(content, "decision two") {
		t.Errorf("overflow file should contain entries: %q", content)
	}
	if !strings.Contains(content, "# Overflow: Decisions") {
		t.Error("overflow file should have header")
	}
	if !strings.HasPrefix(filepath.Base(path), "decisions-") {
		t.Errorf("filename should start with decisions-, got %q", filepath.Base(path))
	}
}

func TestOverflowEntries_AppendsToExistingFile(t *testing.T) {
	ctxDir := t.TempDir()
	archiveDir := filepath.Join(ctxDir, "archive")
	os.MkdirAll(archiveDir, 0o755)

	// Simulate a pre-existing overflow file from the same day.
	overflowEntries(ctxDir, "learned", []string{"first batch"})
	path := overflowEntries(ctxDir, "learned", []string{"second batch"})

	data, _ := os.ReadFile(path)
	content := string(data)
	if !strings.Contains(content, "first batch") {
		t.Error("should preserve existing content")
	}
	if !strings.Contains(content, "second batch") {
		t.Error("should append new content")
	}
}

func TestOverflowEntries_EmptyContextRoot(t *testing.T) {
	path := overflowEntries("", "errors", []string{"some error"})
	if path != "" {
		t.Error("empty contextRoot should return empty path (no write)")
	}
}

func TestOverflowEntries_EmptyEntries(t *testing.T) {
	ctxDir := t.TempDir()
	path := overflowEntries(ctxDir, "decisions", nil)
	if path != "" {
		t.Error("nil entries should return empty path (no write)")
	}
}

// ── SearchMemory ──────────────────────────────────────────────────────────────

func TestSearchMemory_ScopeGlobal(t *testing.T) {
	db := openTestDB(t)

	db.UpsertFile(MemoryFile{Path: "/ctx/MEMORY.md", ProjectPath: "/ctx", ProjectID: "p1", Type: FileTypeMemory, Body: "authentication flow", Fingerprint: "fp1", IndexedAt: 1})
	db.UpsertFile(MemoryFile{Path: "/global/MEMORY.md", ProjectPath: "/global", ProjectID: "", Type: FileTypeGlobal, Body: "authentication preference", Fingerprint: "fp2", IndexedAt: 1})

	results, err := db.SearchMemory(SearchInput{Query: "authentication", Scope: "global", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Path != "/global/MEMORY.md" {
		t.Errorf("global scope filter failed: %v", results)
	}
}

func TestSearchMemory_DefaultLimit(t *testing.T) {
	// Limit 0 should use defaultSearchLimit (20), not return 0 results.
	db := openTestDB(t)
	db.UpsertFile(MemoryFile{Path: "/ctx/a.md", ProjectPath: "/ctx", Type: FileTypeMemory, Body: "test content", Fingerprint: "fp", IndexedAt: 1})

	results, err := db.SearchMemory(SearchInput{Query: "test", Limit: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 {
		t.Error("limit=0 should fall back to default, not return empty")
	}
}
