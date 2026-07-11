package daemon

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/agentmanager"
)

func TestHandlePiListSessions_ReturnsSummaries(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	h := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", testEncodeSessionCWD(cwd))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	path := filepath.Join(sessionDir, "2026-07-10T10-00-00-000Z_session-new.jsonl")
	content := `{"type":"session","version":3,"id":"session-new","timestamp":"2026-07-10T10:00:00.000Z","cwd":"` + cwd + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write session: %v", err)
	}

	result, err := h.dispatchPi(context.Background(), nil, MethodPiListSessions, mustMarshalJSON(t, map[string]any{"cwd": cwd}))
	if err != nil {
		t.Fatalf("dispatchPi: %v", err)
	}
	summaries, ok := result.([]agentmanager.SessionSummary)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if len(summaries) != 1 || summaries[0].SessionID != "session-new" {
		t.Fatalf("unexpected summaries: %#v", summaries)
	}
}

func TestHandlePiListSessions_RequiresCWD(t *testing.T) {
	h := newTestHandler(t)
	_, err := h.dispatchPi(context.Background(), nil, MethodPiListSessions, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error for missing cwd")
	}
}

func mustMarshalJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}
	return data
}

func testEncodeSessionCWD(cwd string) string {
	cleanCWD := filepath.Clean(strings.TrimSpace(cwd))
	normalized := filepath.ToSlash(cleanCWD)
	normalized = strings.TrimPrefix(normalized, "/")
	return "--" + strings.ReplaceAll(normalized, "/", "-") + "--"
}
