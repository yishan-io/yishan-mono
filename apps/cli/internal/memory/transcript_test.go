package memory

import (
	"strings"
	"testing"
)

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

func TestBuildCombinedTranscript_stripsSkillInvocations(t *testing.T) {
	sessions := []*sessionMessages{
		{Messages: []sessionMessage{
			{Role: "user", Content: "YISHAN_COMMAND: ys-research\n\nResearch the current task using the ys-research workflow."},
			{Role: "assistant", Content: "I'll research now..."},
			{Role: "user", Content: "looks good, ship it"},
		}},
	}
	result := buildCombinedTranscript(sessions)
	// Skill invocation should be absent; real user messages should remain.
	if strings.Contains(result, "YISHAN_COMMAND") {
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

func TestStripYishanInjectedContent_realUserMessage(t *testing.T) {
	msg := "Fix the keyboard shortcut ordering bug"
	got := stripYishanInjectedContent(msg)
	if got != msg {
		t.Errorf("real user message should pass through unchanged, got %q", got)
	}
}

func TestStripYishanInjectedContent_skillInvocation(t *testing.T) {
	msg := "YISHAN_COMMAND: ys-research\n\nResearch the current task using the ys-research workflow.\nRead .my-context/tasks/state.json..."
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
	msg := "YISHAN_COMMAND: ys-done\n\nFinalize the current task using the ys-done workflow..."
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
