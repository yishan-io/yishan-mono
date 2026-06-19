package memory

import (
	"strings"
	"testing"
)

// ── parsePersonaSections ─────────────────────────────────────────────────────

func TestParsePersonaSections_empty(t *testing.T) {
	s := parsePersonaSections("")
	if len(s.CodeStyle) != 0 || len(s.WorkflowHabits) != 0 {
		t.Error("expected all empty sections for empty input")
	}
}

func TestParsePersonaSections_allSections(t *testing.T) {
	content := `# Developer Persona

_Last updated: 2026-06-19_

## Code Style

- Prefers strict TypeScript

## Workflow Habits

- Always runs typecheck before push

## Domain Expertise

- Go concurrency patterns

## Tool Preferences

- Uses bun over npm

## Communication Style

- Prefers terse responses
`
	s := parsePersonaSections(content)
	if len(s.CodeStyle) != 1 || s.CodeStyle[0] != "Prefers strict TypeScript" {
		t.Errorf("CodeStyle: got %v", s.CodeStyle)
	}
	if len(s.WorkflowHabits) != 1 || s.WorkflowHabits[0] != "Always runs typecheck before push" {
		t.Errorf("WorkflowHabits: got %v", s.WorkflowHabits)
	}
	if len(s.DomainExpertise) != 1 || s.DomainExpertise[0] != "Go concurrency patterns" {
		t.Errorf("DomainExpertise: got %v", s.DomainExpertise)
	}
	if len(s.ToolPreferences) != 1 || s.ToolPreferences[0] != "Uses bun over npm" {
		t.Errorf("ToolPreferences: got %v", s.ToolPreferences)
	}
	if len(s.CommunicationStyle) != 1 || s.CommunicationStyle[0] != "Prefers terse responses" {
		t.Errorf("CommunicationStyle: got %v", s.CommunicationStyle)
	}
}

func TestParsePersonaSections_multipleEntriesPerSection(t *testing.T) {
	content := `## Code Style

- Prefers strict TypeScript
- No trailing semicolons
- Uses Zod for validation
`
	s := parsePersonaSections(content)
	if len(s.CodeStyle) != 3 {
		t.Errorf("expected 3 CodeStyle entries, got %d: %v", len(s.CodeStyle), s.CodeStyle)
	}
}

// ── buildPersonaMarkdown ─────────────────────────────────────────────────────

func TestBuildPersonaMarkdown_roundTrip(t *testing.T) {
	original := personaSections{
		CodeStyle:      []string{"Prefers strict TypeScript"},
		WorkflowHabits: []string{"Always runs typecheck before push"},
	}
	markdown := buildPersonaMarkdown(original)
	parsed := parsePersonaSections(markdown)

	if len(parsed.CodeStyle) != 1 || parsed.CodeStyle[0] != original.CodeStyle[0] {
		t.Errorf("CodeStyle round-trip failed: got %v", parsed.CodeStyle)
	}
	if len(parsed.WorkflowHabits) != 1 || parsed.WorkflowHabits[0] != original.WorkflowHabits[0] {
		t.Errorf("WorkflowHabits round-trip failed: got %v", parsed.WorkflowHabits)
	}
	// Empty sections should still be present as headings.
	for _, heading := range []PersonaSection{
		PersonaSectionCodeStyle, PersonaSectionWorkflowHabits,
		PersonaSectionDomainExpertise, PersonaSectionToolPreferences, PersonaSectionCommunication,
	} {
		if !strings.Contains(markdown, string(heading)) {
			t.Errorf("heading %q missing from markdown", heading)
		}
	}
}

func TestBuildPersonaMarkdown_allSectionsPresent_evenIfEmpty(t *testing.T) {
	md := buildPersonaMarkdown(personaSections{})
	for _, h := range []PersonaSection{
		PersonaSectionCodeStyle, PersonaSectionWorkflowHabits,
		PersonaSectionDomainExpertise, PersonaSectionToolPreferences, PersonaSectionCommunication,
	} {
		if !strings.Contains(md, string(h)) {
			t.Errorf("empty persona markdown missing heading %q", h)
		}
	}
}

// ── mergePersonaSection ──────────────────────────────────────────────────────

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
	extracted := ExtractedPersona{
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

func TestParseExtractedPersona_valid(t *testing.T) {
	raw := `{"codeStyle":["Prefers strict TypeScript"],"workflowHabits":["Runs typecheck before push"],"domainExpertise":[],"toolPreferences":["Uses bun"],"communicationStyle":[]}`
	p, err := parseExtractedPersona(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.CodeStyle) != 1 || p.CodeStyle[0] != "Prefers strict TypeScript" {
		t.Errorf("CodeStyle: %v", p.CodeStyle)
	}
	if len(p.WorkflowHabits) != 1 {
		t.Errorf("WorkflowHabits: %v", p.WorkflowHabits)
	}
	if len(p.ToolPreferences) != 1 || p.ToolPreferences[0] != "Uses bun" {
		t.Errorf("ToolPreferences: %v", p.ToolPreferences)
	}
}

func TestParseExtractedPersona_withFences(t *testing.T) {
	raw := "```json\n{\"codeStyle\":[\"Uses Zod\"]}\n```"
	p, err := parseExtractedPersona(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(p.CodeStyle) != 1 || p.CodeStyle[0] != "Uses Zod" {
		t.Errorf("CodeStyle: %v", p.CodeStyle)
	}
}

func TestParseExtractedPersona_invalid(t *testing.T) {
	_, err := parseExtractedPersona("not json at all")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

// ── trimPersonaToLimit ───────────────────────────────────────────────────────

func TestTrimPersonaToLimit_withinLimit(t *testing.T) {
	s := personaSections{CodeStyle: []string{"Strict TypeScript"}}
	md := buildPersonaMarkdown(s)
	result := trimPersonaToLimit(md, MaxPersonaChars)
	if result != md {
		t.Error("content within limit should be unchanged")
	}
}

func TestTrimPersonaToLimit_exceedsLimit(t *testing.T) {
	// Build a persona large enough to exceed MaxPersonaChars.
	longEntry := strings.Repeat("this is a very long preference entry that consumes many characters ", 5)
	s := personaSections{
		CommunicationStyle: make([]string, 0),
		ToolPreferences:    make([]string, 0),
		DomainExpertise:    make([]string, 0),
		WorkflowHabits:     make([]string, 0),
		CodeStyle:          make([]string, 0),
	}
	for range 20 {
		s.CommunicationStyle = append(s.CommunicationStyle, longEntry)
		s.ToolPreferences = append(s.ToolPreferences, longEntry)
	}
	md := buildPersonaMarkdown(s)
	if len(md) <= MaxPersonaChars {
		t.Skip("test setup didn't produce content over limit")
	}
	result := trimPersonaToLimit(md, MaxPersonaChars)
	if len(result) > MaxPersonaChars {
		t.Errorf("trimmed result still exceeds limit: %d > %d", len(result), MaxPersonaChars)
	}
}

// ── buildCombinedTranscript ──────────────────────────────────────────────────

func TestBuildCombinedTranscript_empty(t *testing.T) {
	result := buildCombinedTranscript(nil)
	if result != "" {
		t.Errorf("expected empty string for nil sessions, got %q", result)
	}
}

func TestBuildCombinedTranscript_singleSession(t *testing.T) {
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{
			{Role: "user", Content: "hello"},
			{Role: "assistant", Content: "hi there"},
		}},
	}
	result := buildCombinedTranscript(sessions)
	if !strings.Contains(result, "**user**: hello") {
		t.Errorf("expected user message in transcript: %q", result)
	}
	if !strings.Contains(result, "**assistant**: hi there") {
		t.Errorf("expected assistant message in transcript: %q", result)
	}
}

func TestBuildCombinedTranscript_multipleSessions(t *testing.T) {
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{{Role: "user", Content: "session 1"}}},
		{Messages: []sessionMessage{{Role: "user", Content: "session 2"}}},
	}
	result := buildCombinedTranscript(sessions)
	if !strings.Contains(result, "session boundary") {
		t.Errorf("expected session boundary marker: %q", result)
	}
	if !strings.Contains(result, "session 1") || !strings.Contains(result, "session 2") {
		t.Errorf("expected both session contents: %q", result)
	}
}

func TestBuildCombinedTranscript_limitsMessagesPerSession(t *testing.T) {
	msgs := make([]sessionMessage, 50)
	for i := range msgs {
		msgs[i] = sessionMessage{Role: "user", Content: "msg"}
	}
	sessions := []*sessionMessages{{Messages: msgs}}
	result := buildCombinedTranscript(sessions)
	// Should contain at most 30 messages (each "**user**: msg\n\n").
	count := strings.Count(result, "**user**: msg")
	if count > 30 {
		t.Errorf("expected at most 30 messages, got %d", count)
	}
}

// ── stripYishanInjectedContent ───────────────────────────────────────────────

func TestStripYishanInjectedContent_realUserMessage(t *testing.T) {
	msg := "Fix the keyboard shortcut ordering bug"
	got := stripYishanInjectedContent(msg)
	if got != msg {
		t.Errorf("real user message should pass through unchanged, got %q", got)
	}
}

func TestStripYishanInjectedContent_skillInvocation(t *testing.T) {
	msg := "Read ~/.config/opencode/skills/ys-research/SKILL.md and follow its workflow to research the current task.\nRead .my-context/tasks/state.json..."
	got := stripYishanInjectedContent(msg)
	if got != "" {
		t.Errorf("skill invocation should be stripped entirely, got %q", got)
	}
}

func TestStripYishanInjectedContent_personaBlockPrepended(t *testing.T) {
	// Plugin prepends persona block, then "---", then real user message.
	msg := "## Developer Persona (.yishan/memory/PERSONA.md)\n\nPrefers bun...\n\n---\n\nFix the keyboard shortcut ordering bug"
	got := stripYishanInjectedContent(msg)
	if got != "Fix the keyboard shortcut ordering bug" {
		t.Errorf("should return only the real user content after ---: %q", got)
	}
}

func TestStripYishanInjectedContent_projectContextPrepended(t *testing.T) {
	msg := "## Personal Project Context (.my-context/)\n\nSome context...\n\n---\n\nCreate a task for fixing the bug"
	got := stripYishanInjectedContent(msg)
	if got != "Create a task for fixing the bug" {
		t.Errorf("should return content after separator: %q", got)
	}
}

func TestStripYishanInjectedContent_emptyAfterSkillStrip(t *testing.T) {
	// A skill invocation with no real user content following.
	msg := "Read ~/.config/opencode/skills/ys-done/SKILL.md and follow its workflow..."
	got := stripYishanInjectedContent(msg)
	if got != "" {
		t.Errorf("pure skill invocation should return empty: %q", got)
	}
}

func TestStripYishanInjectedContent_clauedSkillPath(t *testing.T) {
	msg := "Read ~/.claude/skills/ys-build/SKILL.md and execute the plan."
	got := stripYishanInjectedContent(msg)
	if got != "" {
		t.Errorf("claude skill invocation should be stripped: %q", got)
	}
}

// ── buildCombinedTranscript strips Yishan noise ───────────────────────────────

func TestBuildCombinedTranscript_stripsSkillInvocations(t *testing.T) {
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{
			{Role: "user", Content: "Read ~/.config/opencode/skills/ys-research/SKILL.md and follow its workflow"},
			{Role: "assistant", Content: "I'll research now..."},
			{Role: "user", Content: "looks good, ship it"},
		}},
	}
	result := buildCombinedTranscript(sessions)
	// Skill invocation should be absent; real user messages should remain.
	if strings.Contains(result, "ys-research") {
		t.Error("skill invocation should be stripped from transcript")
	}
	if !strings.Contains(result, "ship it") {
		t.Error("real user message should remain in transcript")
	}
}

func TestBuildCombinedTranscript_stripsPersonaBlock(t *testing.T) {
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{
			{Role: "user", Content: "## Developer Persona (.yishan/memory/PERSONA.md)\n\nPrefers bun...\n\n---\n\nFix the shortcut bug"},
			{Role: "assistant", Content: "I'll look at the shortcut handler"},
		}},
	}
	result := buildCombinedTranscript(sessions)
	if strings.Contains(result, "Developer Persona") {
		t.Error("persona block should be stripped from transcript")
	}
	if !strings.Contains(result, "Fix the shortcut bug") {
		t.Error("real user content after separator should remain")
	}
}

func TestBuildCombinedTranscript_dropsEntirelyStrippedMessages(t *testing.T) {
	// A session where all user messages are skill invocations should produce
	// a transcript with only assistant messages (or be empty if no content).
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{
			{Role: "user", Content: "Read ~/.config/opencode/skills/ys-build/SKILL.md and build."},
			{Role: "assistant", Content: "Building now..."},
		}},
	}
	result := buildCombinedTranscript(sessions)
	// The skill invocation user message should be gone.
	if strings.Contains(result, "ys-build") {
		t.Error("stripped message content should not appear in transcript")
	}
	// The assistant message should still be there (provides context).
	if !strings.Contains(result, "Building now") {
		t.Error("assistant message should remain even if user message is stripped")
	}
}
