package memory

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPersonaSummarizeForPersona_UsesBuiltInPiAgent(t *testing.T) {
	homeDir := t.TempDir()
	if err := os.Setenv("HOME", homeDir); err != nil {
		t.Fatalf("Setenv HOME: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Unsetenv("HOME")
	})

	var gotAgentKind string
	var gotModel string
	ps := NewPersonaSummarizer(
		SummarizerConfig{Enabled: true, AgentKind: BuiltInSummarizerAgentKind, Model: "openai/gpt-5"},
		func(_ context.Context, agentKind, model, prompt, workDir string) (string, error) {
			gotAgentKind = agentKind
			gotModel = model
			return `{"codeStyle":["Prefers strict TypeScript"],"workflowHabits":[],"domainExpertise":[],"toolPreferences":[],"communicationStyle":[]}`,
				nil
		},
	)

	result, err := ps.SummarizeForPersona("opencode", []*sessionMessages{{
		Messages: []sessionMessage{{Role: "user", Content: "hello"}},
	}})
	if err != nil {
		t.Fatalf("SummarizeForPersona: %v", err)
	}
	if result.Skipped {
		t.Fatal("expected persona summarize run, got skipped")
	}
	if gotAgentKind != BuiltInSummarizerAgentKind {
		t.Fatalf("agentKind = %q, want %q", gotAgentKind, BuiltInSummarizerAgentKind)
	}
	if gotModel != "openai/gpt-5" {
		t.Fatalf("model = %q, want %q", gotModel, "openai/gpt-5")
	}
	if _, err := os.Stat(filepath.Join(homeDir, ".yishan", "memory", "PERSONA.md")); err != nil {
		t.Fatalf("expected PERSONA.md written: %v", err)
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
