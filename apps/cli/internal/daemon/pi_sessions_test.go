package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/config"
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

func TestHandlePiStart_OverridesLegacyAgentDirEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	legacyAgentDir := filepath.Join(homeDir, ".yishan")
	t.Setenv(config.PiAgentDirEnvKey, legacyAgentDir)

	markerPath := filepath.Join(homeDir, "pi-agent-dir.txt")
	installFakePiBinary(t, markerPath)

	h := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &wsConnState{}
	_, err := h.dispatchPi(context.Background(), connState, MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-1",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi: %v", err)
	}

	got := waitForFileContent(t, markerPath)
	want := filepath.Join(homeDir, ".yishan", "pi", "agent")
	if got != want {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", got, want)
	}
	if got == legacyAgentDir {
		t.Fatalf("expected managed pi agent dir to override legacy dir %q", legacyAgentDir)
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

func installFakePiBinary(t *testing.T, markerPath string) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' \"$%s\" > %q\n", config.PiAgentDirEnvKey, markerPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func waitForFileContent(t *testing.T, path string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			return string(content)
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
	return ""
}
