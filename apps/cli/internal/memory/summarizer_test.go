package memory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseMemorySections_CurrentStructure(t *testing.T) {
	content := `# Project Memory

_Last updated: 2026-06-14_

## Locked Decisions

- 2026-06-14 — Used modernc.org/sqlite. Why: avoids CGO.

## Durable Discoveries

- [Invariant] 2026-06-14 — .my-context is a symlink to contexts/<repoKey>

## Open Questions

- 2026-06-14 — Should search index archive files by default?
`

	sections := parseMemorySections(content)

	if len(sections.LockedDecisions) != 1 {
		t.Errorf("expected 1 locked decision, got %d", len(sections.LockedDecisions))
	}
	if len(sections.DurableDiscoveries) != 1 {
		t.Errorf("expected 1 durable discovery, got %d", len(sections.DurableDiscoveries))
	}
	if len(sections.OpenQuestions) != 1 {
		t.Errorf("expected 1 open question, got %d", len(sections.OpenQuestions))
	}
}

func TestParseMemorySections_LegacyStructure(t *testing.T) {
	content := `## My Decisions

- 2026-06-13 — Old decision

## What I Learned

- 2026-06-13 — Old learning

## Errors

- 2026-06-13 — old error root cause
`

	sections := parseMemorySections(content)

	if len(sections.LockedDecisions) != 1 {
		t.Errorf("expected 1 locked decision, got %d", len(sections.LockedDecisions))
	}
	if len(sections.DurableDiscoveries) != 2 {
		t.Errorf("expected 2 durable discoveries, got %d", len(sections.DurableDiscoveries))
	}
}

func TestParseMemorySections_Empty(t *testing.T) {
	sections := parseMemorySections("")
	if len(sections.LockedDecisions) != 0 || len(sections.DurableDiscoveries) != 0 || len(sections.OpenQuestions) != 0 {
		t.Error("empty content should produce empty sections")
	}
}

func TestBuildMemoryMarkdown_RoundTrip(t *testing.T) {
	sections := memorySections{
		LockedDecisions:    []string{"2026-06-14 — Used JWT. Why: simple auth."},
		DurableDiscoveries: []string{"[Test Trap] 2026-06-14 — JWT expiry is 1h"},
		OpenQuestions:      []string{"2026-06-14 — Should refresh tokens rotate?"},
	}
	md := buildMemoryMarkdown(sections)

	if !strings.Contains(md, string(SectionLockedDecisions)) {
		t.Error("missing locked decisions header")
	}
	if !strings.Contains(md, "- 2026-06-14 — Used JWT. Why: simple auth.") {
		t.Error("missing decision")
	}
	if !strings.Contains(md, "- [Test Trap] 2026-06-14 — JWT expiry is 1h") {
		t.Error("missing durable discovery")
	}
	if !strings.Contains(md, "- 2026-06-14 — Should refresh tokens rotate?") {
		t.Error("missing open question")
	}
}

func TestContainsEntry(t *testing.T) {
	entries := []string{
		"[Root Cause] 2026-06-18 — Duplicate tab came from stale session id on daemon restart",
		"hello world",
	}

	if !containsEntry(entries, "hello world") {
		t.Error("exact match should return true")
	}
	if !containsEntry(entries, "  HELLO WORLD  ") {
		t.Error("case-insensitive trimmed match should return true")
	}
	if !containsEntry(entries, "duplicate tab came from stale session id") {
		t.Error("containment match should return true")
	}
	if containsEntry(entries, "not found") {
		t.Error("missing entry should return false")
	}
	if containsEntry(nil, "anything") {
		t.Error("nil slice should return false")
	}
}

func TestParseExtractedJSON_Valid(t *testing.T) {
	raw := `{
		"lockedDecisions": ["2026-06-14 — Used SQLite. Why: lightweight."],
		"durableDiscoveries": ["[Invariant] 2026-06-14 — FTS5 requires triggers"],
		"openQuestions": ["2026-06-14 — Should we index archives?"]
	}`

	knowledge, err := parseExtractedJSON(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(knowledge.LockedDecisions) != 1 {
		t.Errorf("expected 1 locked decision, got %d", len(knowledge.LockedDecisions))
	}
	if len(knowledge.DurableDiscoveries) != 1 {
		t.Errorf("expected 1 durable discovery, got %d", len(knowledge.DurableDiscoveries))
	}
	if len(knowledge.OpenQuestions) != 1 {
		t.Errorf("expected 1 open question, got %d", len(knowledge.OpenQuestions))
	}
}

func TestParseExtractedJSON_LegacyFallback(t *testing.T) {
	knowledge, err := parseExtractedJSON(`{"decisions":["decision"],"learned":["learned"],"errors":["error"],"openQuestions":[]}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(knowledge.LockedDecisions) != 1 {
		t.Errorf("expected 1 locked decision, got %d", len(knowledge.LockedDecisions))
	}
	if len(knowledge.DurableDiscoveries) != 2 {
		t.Errorf("expected learned+errors fallback, got %d", len(knowledge.DurableDiscoveries))
	}
}

func TestParseExtractedJSON_StrippedFences(t *testing.T) {
	raw := "```json\n{\"lockedDecisions\":[],\"durableDiscoveries\":[],\"openQuestions\":[]}\n```"
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

func TestMergeAndWrite_AppendsNewEntries(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	existing := `# Project Memory

## Locked Decisions

- 2026-06-13 — Old decision

## Durable Discoveries

- [Invariant] 2026-06-13 — Old learning

## Open Questions

- 2026-06-13 — Old question
`
	if err := os.WriteFile(memPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	extracted := ExtractedKnowledge{
		LockedDecisions:    []string{"2026-06-14 — New decision. Why: important."},
		DurableDiscoveries: []string{"[Workflow Trap] 2026-06-14 — New learning"},
		OpenQuestions:      []string{"2026-06-14 — New question?"},
	}

	written, err := mergeAndWrite(memPath, existing, extracted, ctxDir)
	if err != nil {
		t.Fatalf("mergeAndWrite: %v", err)
	}
	if len(written) == 0 {
		t.Fatal("expected at least one written path")
	}

	result, err := os.ReadFile(memPath)
	if err != nil {
		t.Fatal(err)
	}
	content := string(result)

	if !strings.Contains(content, "Old decision") || !strings.Contains(content, "New decision") {
		t.Error("should preserve and append decisions")
	}
	if !strings.Contains(content, "Old learning") || !strings.Contains(content, "New learning") {
		t.Error("should preserve and append discoveries")
	}
	if !strings.Contains(content, "Old question") || !strings.Contains(content, "New question") {
		t.Error("should preserve and append open questions")
	}
}

func TestMergeAndWrite_Deduplicates(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	existing := `## Durable Discoveries

- [Root Cause] 2026-06-14 — Duplicate tabs came from stale session ids on restart
`
	if err := os.WriteFile(memPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	extracted := ExtractedKnowledge{
		DurableDiscoveries: []string{"duplicate tabs came from stale session ids"},
	}

	if _, err := mergeAndWrite(memPath, existing, extracted, ctxDir); err != nil {
		t.Fatal(err)
	}

	result, err := os.ReadFile(memPath)
	if err != nil {
		t.Fatal(err)
	}
	count := strings.Count(string(result), "Duplicate tabs")
	if count != 1 {
		t.Errorf("expected 1 occurrence of duplicate topic, got %d", count)
	}
}

func TestMergeAndWrite_CreatesFile(t *testing.T) {
	ctxDir := t.TempDir()
	memPath := filepath.Join(ctxDir, "MEMORY.md")

	extracted := ExtractedKnowledge{
		LockedDecisions: []string{"2026-06-14 — First decision. Why: bootstrap."},
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
	content := strings.Repeat("x", MaxGlobalMemoryChars+1)
	b := checkBudget(content, "/home/user/.yishan/memory/global/MEMORY.md", "")
	if !b.Exceeded {
		t.Error("should exceed global budget")
	}
	if b.Limit != MaxGlobalMemoryChars {
		t.Errorf("expected global limit %d, got %d", MaxGlobalMemoryChars, b.Limit)
	}
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

func TestTrimSectionKeepingLatestEntries_KeepsMostRecentEntries(t *testing.T) {
	ctxDir := t.TempDir()
	entries := []string{"decision one", "decision two", "decision three", "decision four", "decision five"}

	trimmedEntries, overflowPath := trimSectionKeepingLatestEntries(entries, 3, ctxDir, "locked-decisions")

	if overflowPath == "" {
		t.Fatal("expected a non-empty overflow path")
	}
	if len(trimmedEntries) != 3 {
		t.Fatalf("expected 3 trimmed entries, got %d", len(trimmedEntries))
	}
	if strings.Join(trimmedEntries, ",") != "decision three,decision four,decision five" {
		t.Fatalf("expected latest entries to remain, got %v", trimmedEntries)
	}

	data, err := os.ReadFile(overflowPath)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	if !strings.Contains(content, "decision one") || !strings.Contains(content, "decision two") {
		t.Errorf("overflow file should contain older entries: %q", content)
	}
	if strings.Contains(content, "decision four") || strings.Contains(content, "decision five") {
		t.Errorf("overflow file should not contain retained latest entries: %q", content)
	}
	if !strings.Contains(content, "# Overflow: Locked Decisions") {
		t.Error("overflow file should have normalized header")
	}
	if !strings.HasPrefix(filepath.Base(overflowPath), "locked-decisions-") {
		t.Errorf("filename should start with locked-decisions-, got %q", filepath.Base(overflowPath))
	}
}

func TestTrimToBudget_KeepsLatestEntriesInMemory(t *testing.T) {
	ctxDir := t.TempDir()
	content := `# Project Memory

_Last updated: 2026-07-10_

## Locked Decisions

- decision one
- decision two
- decision three
- decision four

## Durable Discoveries

- discovery one
- discovery two
- discovery three
- discovery four

## Open Questions

- question one
`

	trimmedContent, overflowPaths := trimToBudget(content, 1, ctxDir)
	if len(overflowPaths) == 0 {
		t.Fatal("expected overflow paths when forcing trim")
	}
	if !strings.Contains(trimmedContent, "decision four") || strings.Contains(trimmedContent, "decision one") {
		t.Fatalf("expected latest locked decisions to remain, got: %q", trimmedContent)
	}
	if !strings.Contains(trimmedContent, "discovery four") || strings.Contains(trimmedContent, "discovery one") {
		t.Fatalf("expected latest durable discoveries to remain, got: %q", trimmedContent)
	}
	if strings.Contains(trimmedContent, "question one") {
		t.Fatalf("expected open questions to be fully archived, got: %q", trimmedContent)
	}
}

func TestOverflowEntries_RewritesExistingFileWithoutDuplicateHeadings(t *testing.T) {
	ctxDir := t.TempDir()
	path := overflowEntries(ctxDir, "durable-discoveries", []string{"first batch"})
	path = overflowEntries(ctxDir, "durable-discoveries", []string{"second batch", "first batch"})

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	if strings.Count(content, "# Overflow: Durable Discoveries") != 1 {
		t.Fatalf("expected a single heading, got: %q", content)
	}
	if strings.Count(content, "first batch") != 1 {
		t.Fatalf("expected deduped existing entry, got: %q", content)
	}
	if !strings.Contains(content, "second batch") {
		t.Fatalf("missing appended batch: %q", content)
	}
}

func TestOverflowEntries_EmptyContextRoot(t *testing.T) {
	path := overflowEntries("", "open-questions", []string{"some question"})
	if path != "" {
		t.Error("empty contextRoot should return empty path (no write)")
	}
}

func TestOverflowEntries_EmptyEntries(t *testing.T) {
	ctxDir := t.TempDir()
	path := overflowEntries(ctxDir, "locked-decisions", nil)
	if path != "" {
		t.Error("nil entries should return empty path (no write)")
	}
}

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
