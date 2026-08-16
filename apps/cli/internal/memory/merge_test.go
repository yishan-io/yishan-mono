package memory

import (
	"testing"
)

func TestMergePersonaSection_appendNew(t *testing.T) {
	existing := []string{"Prefers strict TypeScript"}
	newEntries := []string{"Uses Zod for validation"}
	result := mergePersonaSection(existing, newEntries)
	if len(result) != 2 {
		t.Fatalf("expected 2 entries, got %d: %v", len(result), result)
	}
	if result[0] != "Prefers strict TypeScript" {
		t.Errorf("existing entry should be preserved: %v", result[0])
	}
	if result[1] != "Uses Zod for validation" {
		t.Errorf("new entry should be appended: %v", result[1])
	}
}

func TestMergePersonaSection_replaceOnContradiction(t *testing.T) {
	existing := []string{"Prefers npm over bun"}
	newEntries := []string{"Prefers bun over npm"}
	result := mergePersonaSection(existing, newEntries)
	// High word overlap ("prefers", "npm", "bun") → replace, not append.
	if len(result) != 1 {
		t.Fatalf("expected 1 entry after replacement, got %d: %v", len(result), result)
	}
	if result[0] != "Prefers bun over npm" {
		t.Errorf("expected new entry to replace old: %v", result[0])
	}
}

func TestMergePersonaSection_skipExactDuplicate(t *testing.T) {
	existing := []string{"Prefers strict TypeScript"}
	newEntries := []string{"Prefers strict TypeScript"}
	result := mergePersonaSection(existing, newEntries)
	if len(result) != 1 {
		t.Fatalf("expected 1 entry (deduped), got %d", len(result))
	}
}

func TestMergePersonaSection_emptyExisting(t *testing.T) {
	result := mergePersonaSection(nil, []string{"Uses bun over npm"})
	if len(result) != 1 || result[0] != "Uses bun over npm" {
		t.Errorf("expected new entry in empty section: %v", result)
	}
}

func TestMergePersonaSection_emptyNew(t *testing.T) {
	existing := []string{"Prefers strict TypeScript"}
	result := mergePersonaSection(existing, nil)
	if len(result) != 1 || result[0] != "Prefers strict TypeScript" {
		t.Errorf("existing entries should be unchanged: %v", result)
	}
}

// ── mergePersona ─────────────────────────────────────────────────────────────

func TestMergePersona_allSections(t *testing.T) {
	existing := personaSections{
		CodeStyle:      []string{"Prefers npm over bun"},
		WorkflowHabits: []string{"Always runs lint"},
	}
	extracted := extractedPersona{
		CodeStyle:       []string{"Prefers bun over npm"},
		DomainExpertise: []string{"Go concurrency patterns"},
	}
	merged := mergePersona(existing, extracted)

	// CodeStyle: replaced
	if len(merged.CodeStyle) != 1 || merged.CodeStyle[0] != "Prefers bun over npm" {
		t.Errorf("CodeStyle should be replaced: %v", merged.CodeStyle)
	}
	// WorkflowHabits: unchanged
	if len(merged.WorkflowHabits) != 1 || merged.WorkflowHabits[0] != "Always runs lint" {
		t.Errorf("WorkflowHabits should be unchanged: %v", merged.WorkflowHabits)
	}
	// DomainExpertise: appended
	if len(merged.DomainExpertise) != 1 || merged.DomainExpertise[0] != "Go concurrency patterns" {
		t.Errorf("DomainExpertise should have new entry: %v", merged.DomainExpertise)
	}
}

// ── wordOverlapRatio ─────────────────────────────────────────────────────────

func TestWordOverlapRatio_identical(t *testing.T) {
	a := wordSet("prefers bun over npm")
	b := wordSet("prefers bun over npm")
	if wordOverlapRatio(a, b) != 1.0 {
		t.Errorf("identical sets should have ratio 1.0")
	}
}

func TestWordOverlapRatio_noOverlap(t *testing.T) {
	a := wordSet("prefers typescript strict")
	b := wordSet("uses zod validation")
	if wordOverlapRatio(a, b) != 0.0 {
		t.Errorf("disjoint sets should have ratio 0.0, got %.2f", wordOverlapRatio(a, b))
	}
}

func TestWordOverlapRatio_highOverlap(t *testing.T) {
	a := wordSet("prefers npm over bun")
	b := wordSet("prefers bun over npm")
	r := wordOverlapRatio(a, b)
	// "prefers", "over", "npm" or "bun" overlap — 3/4 = 0.75
	if r < 0.6 {
		t.Errorf("high-overlap sets: expected ≥0.6, got %.2f", r)
	}
}

func TestWordOverlapRatio_bothEmpty(t *testing.T) {
	if wordOverlapRatio(wordSet(""), wordSet("")) != 1.0 {
		t.Errorf("both empty sets should return 1.0 (no contradiction)")
	}
}

// ── parseExtractedPersona ────────────────────────────────────────────────────
