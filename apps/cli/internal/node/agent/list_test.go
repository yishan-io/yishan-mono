package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/rpc"
)

func TestPiListSessions_ReturnsSummaries(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	s := newTestHandler(t)
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

	result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, mustMarshalJSON(t, map[string]any{"cwd": cwd}))
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

func TestPiListSessions_ReadsSessionInfoName(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", testEncodeSessionCWD(cwd))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	t.Run("latest session_info entry wins", func(t *testing.T) {
		path := filepath.Join(sessionDir, "2026-07-10T10-00-00-000Z_session-name.jsonl")
		content := `{"type":"session","version":3,"id":"session-name","timestamp":"2026-07-10T10:00:00.000Z","cwd":"` + cwd + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
{"type":"session_info","name":"first name"}
{"type":"session_info","name":"second name"}
`
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write session: %v", err)
		}

		result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, mustMarshalJSON(t, map[string]any{"cwd": cwd}))
		if err != nil {
			t.Fatalf("dispatchPi: %v", err)
		}
		summaries := result.([]agentmanager.SessionSummary)
		if summaries[0].SessionName != "second name" {
			t.Fatalf("expected SessionName 'second name', got %q", summaries[0].SessionName)
		}
	})

	t.Run("empty name does not overwrite prior name", func(t *testing.T) {
		path := filepath.Join(sessionDir, "2026-07-10T10-01-00-000Z_session-empty.jsonl")
		content := `{"type":"session","version":3,"id":"session-empty","timestamp":"2026-07-10T10:01:00.000Z","cwd":"` + cwd + `"}
{"type":"session_info","name":"real name"}
{"type":"session_info","name":""}
`
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write session: %v", err)
		}

		result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, mustMarshalJSON(t, map[string]any{"cwd": cwd}))
		if err != nil {
			t.Fatalf("dispatchPi: %v", err)
		}
		summaries := result.([]agentmanager.SessionSummary)
		if summaries[0].SessionName != "real name" {
			t.Fatalf("expected SessionName 'real name', got %q", summaries[0].SessionName)
		}
	})

	t.Run("no session_info lines means empty session name", func(t *testing.T) {
		path := filepath.Join(sessionDir, "2026-07-10T10-02-00-000Z_session-none.jsonl")
		content := `{"type":"session","version":3,"id":"session-none","timestamp":"2026-07-10T10:02:00.000Z","cwd":"` + cwd + `"}
{"type":"message","id":"user-1","timestamp":"2026-07-10T10:00:02.000Z","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
`
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write session: %v", err)
		}

		result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, mustMarshalJSON(t, map[string]any{"cwd": cwd}))
		if err != nil {
			t.Fatalf("dispatchPi: %v", err)
		}
		summaries := result.([]agentmanager.SessionSummary)
		if summaries[0].SessionName != "" {
			t.Fatalf("expected empty SessionName, got %q", summaries[0].SessionName)
		}
	})
}

func TestPiListSessions_RequiresCWD(t *testing.T) {
	s := newTestHandler(t)
	_, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error for missing cwd")
	}
}

func TestPiGetSessionFile_ReturnsMatchingTranscriptPath(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	sessionDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "sessions", testEncodeSessionCWD(cwd))
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	path := filepath.Join(sessionDir, "2026-07-10T10-00-00-000Z_session-abc.jsonl")
	if err := os.WriteFile(path, []byte(`{"type":"session","version":3,"id":"session-abc"}`), 0o644); err != nil {
		t.Fatalf("write session: %v", err)
	}

	result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{
		"cwd":       cwd,
		"sessionId": "session-abc",
	}))
	if err != nil {
		t.Fatalf("dispatchPi: %v", err)
	}
	resp, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if resp["filePath"] != path {
		t.Fatalf("expected filePath %q, got %q", path, resp["filePath"])
	}
}

func TestPiGetSessionFile_EmptyWhenNoTranscript(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")

	result, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{
		"cwd":       cwd,
		"sessionId": "session-abc",
	}))
	if err != nil {
		t.Fatalf("dispatchPi: %v", err)
	}
	resp, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if resp["filePath"] != "" {
		t.Fatalf("expected empty filePath, got %q", resp["filePath"])
	}
}

func TestPiGetSessionFile_RequiresCWDAndSessionID(t *testing.T) {
	s := newTestHandler(t)

	_, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, json.RawMessage(`{}`))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)

	_, err = s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{"sessionId": "session-abc"}))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)

	_, err = s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{"cwd": "/tmp"}))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)
}

func TestPiListActiveSessions_ReturnsLiveSessions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-1",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-1",
		}))
	}()

	result, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiListActiveSessions, mustMarshalJSON(t, map[string]any{}))
	if err != nil {
		t.Fatalf("dispatchPi listActive: %v", err)
	}

	summaries, ok := result.([]rpc.PiActiveSessionSummary)
	if !ok {
		t.Fatalf("unexpected result type %T", result)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 active session, got %#v", summaries)
	}
	if summaries[0].SessionID != "session-1" || summaries[0].TabID != "tab-1" || summaries[0].CWD != cwd {
		t.Fatalf("unexpected active session summary: %#v", summaries[0])
	}
}
