package memory

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

const piReadableSessionFixture = `{"type":"session","version":3,"id":"session-1","timestamp":"2026-07-10T08:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T08:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"investigate archive drain"}]}}
{"type":"message","id":"assistant-1","timestamp":"2026-07-10T08:00:05.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"skip me"},{"type":"text","text":"I found the issue."},{"type":"toolCall","id":"call-1","name":"read","arguments":{"path":"MEMORY.md"}},{"type":"text","text":"It needs a Pi reader."}]}}
{"type":"message","id":"tool-result-1","timestamp":"2026-07-10T08:00:06.000Z","message":{"role":"toolResult","content":[{"type":"text","text":"tool output"}]}}
`

const piSummarizeJobFixture = `{"type":"session","version":3,"id":"session-summarize","timestamp":"2026-07-10T09:00:00.000Z","cwd":"/tmp/pi-project"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T09:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Summarize the following AI coding conversation for a developer's project memory file."}]}}
`

func TestReadPiSession_UsesLatestMatchingReadableSession(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	managedRoot := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", "workspace-a")
	legacyRoot := filepath.Join(homeDir, ".pi", "agent", "sessions", "workspace-a")
	if err := os.MkdirAll(managedRoot, 0o755); err != nil {
		t.Fatalf("mkdir managed root: %v", err)
	}
	if err := os.MkdirAll(legacyRoot, 0o755); err != nil {
		t.Fatalf("mkdir legacy root: %v", err)
	}

	legacyFile := filepath.Join(legacyRoot, "2026-07-10T08-00-00-000Z_session-legacy.jsonl")
	if err := os.WriteFile(legacyFile, []byte(piReadableSessionFixture), 0o644); err != nil {
		t.Fatalf("write legacy fixture: %v", err)
	}
	olderTime := time.Date(2026, 7, 10, 8, 0, 0, 0, time.UTC)
	if err := os.Chtimes(legacyFile, olderTime, olderTime); err != nil {
		t.Fatalf("chtimes legacy fixture: %v", err)
	}

	summarizeFile := filepath.Join(managedRoot, "2026-07-10T09-00-00-000Z_session-summarize.jsonl")
	if err := os.WriteFile(summarizeFile, []byte(piSummarizeJobFixture), 0o644); err != nil {
		t.Fatalf("write summarize fixture: %v", err)
	}
	middleTime := time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC)
	if err := os.Chtimes(summarizeFile, middleTime, middleTime); err != nil {
		t.Fatalf("chtimes summarize fixture: %v", err)
	}

	readableFile := filepath.Join(managedRoot, "2026-07-10T10-00-00-000Z_session-readable.jsonl")
	if err := os.WriteFile(readableFile, []byte(piReadableSessionFixture), 0o644); err != nil {
		t.Fatalf("write readable fixture: %v", err)
	}
	newerTime := time.Date(2026, 7, 10, 10, 0, 0, 0, time.UTC)
	if err := os.Chtimes(readableFile, newerTime, newerTime); err != nil {
		t.Fatalf("chtimes readable fixture: %v", err)
	}

	reader := newAgentDBReader()
	session, err := reader.readPiSession("/tmp/pi-project")
	if err != nil {
		t.Fatalf("readPiSession: %v", err)
	}
	if session.SessionID != "session-1" {
		t.Fatalf("expected session id session-1, got %q", session.SessionID)
	}
	if len(session.Messages) != 2 {
		t.Fatalf("expected 2 readable messages, got %d", len(session.Messages))
	}
	if session.Messages[0].Role != "user" || session.Messages[0].Content != "investigate archive drain" {
		t.Fatalf("unexpected first message: %+v", session.Messages[0])
	}
	if session.Messages[1].Role != "assistant" || session.Messages[1].Content != "I found the issue.\n\nIt needs a Pi reader." {
		t.Fatalf("unexpected second message: %+v", session.Messages[1])
	}
}

func TestReadPiTranscript_FiltersWorkspaceMismatch(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "session.jsonl")
	if err := os.WriteFile(filePath, []byte(piReadableSessionFixture), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	session, err := readPiTranscript(filePath, "/tmp/other-project")
	if err != nil {
		t.Fatalf("readPiTranscript: %v", err)
	}
	if len(session.Messages) != 0 {
		t.Fatalf("expected 0 messages for mismatched workspace, got %d", len(session.Messages))
	}
}
