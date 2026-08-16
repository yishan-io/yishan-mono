package memory

import (
	"strings"
	"testing"
)

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
