package agentmanager

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListSessionSummaries_SortsByTimestampAndParsesPreview(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", encodeSessionCWD(cwd))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	olderSession := `{"type":"session","version":3,"id":"session-old","timestamp":"2026-07-10T08:00:00.000Z","cwd":"` + cwd + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T08:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"older preview"}]}}
`
	newerSession := `{"type":"session","version":3,"id":"session-new","timestamp":"2026-07-10T10:00:00.000Z","cwd":"` + cwd + `"}
{"type":"model_change","id":"model-1","timestamp":"2026-07-10T10:00:01.000Z","provider":"openai-codex","modelId":"gpt-5.5"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"newer preview"}]}}
`

	olderPath := filepath.Join(sessionDir, "2026-07-10T08-00-00-000Z_session-old.jsonl")
	if err := os.WriteFile(olderPath, []byte(olderSession), 0o644); err != nil {
		t.Fatalf("write older session: %v", err)
	}
	newerPath := filepath.Join(sessionDir, "2026-07-10T10-00-00-000Z_session-new.jsonl")
	if err := os.WriteFile(newerPath, []byte(newerSession), 0o644); err != nil {
		t.Fatalf("write newer session: %v", err)
	}

	summaries, err := ListSessionSummaries(context.Background(), cwd)
	if err != nil {
		t.Fatalf("ListSessionSummaries: %v", err)
	}
	if len(summaries) != 2 {
		t.Fatalf("expected 2 summaries, got %d", len(summaries))
	}
	if summaries[0].SessionID != "session-new" {
		t.Fatalf("expected newest session first, got %q", summaries[0].SessionID)
	}
	if summaries[0].Model != "gpt-5.5" {
		t.Fatalf("expected model gpt-5.5, got %q", summaries[0].Model)
	}
	if summaries[0].PreviewText != "newer preview" {
		t.Fatalf("expected preview text from user message, got %q", summaries[0].PreviewText)
	}
	if summaries[0].CWD != cwd {
		t.Fatalf("expected cwd %q, got %q", cwd, summaries[0].CWD)
	}
	if summaries[1].SessionID != "session-old" {
		t.Fatalf("expected older session second, got %q", summaries[1].SessionID)
	}
	if summaries[1].PreviewText != "older preview" {
		t.Fatalf("expected older preview text, got %q", summaries[1].PreviewText)
	}
}

func TestListSessionSummaries_IgnoresLegacyPiRoot(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	legacySessionDir := filepath.Join(homeDir, ".pi", "agent", "sessions", encodeSessionCWD(cwd))
	if err := os.MkdirAll(legacySessionDir, 0o755); err != nil {
		t.Fatalf("mkdir legacy session dir: %v", err)
	}
	legacyPath := filepath.Join(legacySessionDir, "2026-07-10T08-00-00-000Z_session-legacy.jsonl")
	legacySession := `{"type":"session","version":3,"id":"session-legacy","timestamp":"2026-07-10T08:00:00.000Z","cwd":"` + cwd + `"}`
	if err := os.WriteFile(legacyPath, []byte(legacySession), 0o644); err != nil {
		t.Fatalf("write legacy session: %v", err)
	}

	summaries, err := ListSessionSummaries(context.Background(), cwd)
	if err != nil {
		t.Fatalf("ListSessionSummaries: %v", err)
	}
	if len(summaries) != 0 {
		t.Fatalf("expected no summaries from legacy root, got %d", len(summaries))
	}
}

func TestListSessionSummaries_IgnoresSubAgentSessions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", encodeSessionCWD(cwd))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	// Main session — no parentSession field.
	mainSession := `{"type":"session","version":3,"id":"session-main","timestamp":"2026-07-10T10:00:00.000Z","cwd":"` + cwd + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"main session preview"}]}}
`

	// Sub-agent session — has parentSession on the header line.
	subAgentSession := `{"type":"session","version":3,"id":"session-child","timestamp":"2026-07-10T11:00:00.000Z","cwd":"` + cwd + `","parentSession":"/some/parent/session.jsonl"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T11:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"child session preview"}]}}
`

	mainPath := filepath.Join(sessionDir, "2026-07-10T10-00-00-000Z_session-main.jsonl")
	if err := os.WriteFile(mainPath, []byte(mainSession), 0o644); err != nil {
		t.Fatalf("write main session: %v", err)
	}
	subAgentPath := filepath.Join(sessionDir, "2026-07-10T11-00-00-000Z_session-child.jsonl")
	if err := os.WriteFile(subAgentPath, []byte(subAgentSession), 0o644); err != nil {
		t.Fatalf("write sub-agent session: %v", err)
	}

	summaries, err := ListSessionSummaries(context.Background(), cwd)
	if err != nil {
		t.Fatalf("ListSessionSummaries: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 summary (main only), got %d", len(summaries))
	}
	if summaries[0].SessionID != "session-main" {
		t.Fatalf("expected main session, got %q", summaries[0].SessionID)
	}
	if summaries[0].PreviewText != "main session preview" {
		t.Fatalf("expected main session preview, got %q", summaries[0].PreviewText)
	}
}

func TestListSessionSummaries_PrefersHeaderCWDOverDirectoryCWD(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	listingCWD := filepath.Join(homeDir, "worktrees", "legacy-project")
	headerCWD := filepath.Join(homeDir, "worktrees", "original-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", encodeSessionCWD(listingCWD))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	sessionBody := `{"type":"session","version":3,"id":"session-mismatch","timestamp":"2026-07-10T08:00:00.000Z","cwd":"` + headerCWD + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T08:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"mismatch preview"}]}}
`
	sessionPath := filepath.Join(sessionDir, "2026-07-10T08-00-00-000Z_session-mismatch.jsonl")
	if err := os.WriteFile(sessionPath, []byte(sessionBody), 0o644); err != nil {
		t.Fatalf("write mismatched session: %v", err)
	}

	summaries, err := ListSessionSummaries(context.Background(), listingCWD)
	if err != nil {
		t.Fatalf("ListSessionSummaries: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 summary, got %d", len(summaries))
	}
	if summaries[0].CWD != headerCWD {
		t.Fatalf("expected header cwd %q, got %q", headerCWD, summaries[0].CWD)
	}
}

func TestParseTimestampValue_ParsesRFC3339AndUnixMillis(t *testing.T) {
	parsed, ok := parseTimestampValue("2026-07-10T10:00:00.000Z")
	if !ok || parsed.UTC().Format(time.RFC3339Nano) != "2026-07-10T10:00:00Z" {
		t.Fatalf("unexpected parsed RFC3339 timestamp: %v %v", parsed, ok)
	}
	parsed, ok = parseTimestampValue(float64(1780007205000))
	if !ok || parsed.UnixMilli() != 1780007205000 {
		t.Fatalf("unexpected parsed unix milli timestamp: %v %v", parsed, ok)
	}
}
