package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/workspace"
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

func TestHandlePiListActiveSessions_ReturnsLiveSessions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

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
		t.Fatalf("dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = h.dispatchPi(context.Background(), connState, MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-1",
		}))
	}()

	result, err := h.dispatchPi(context.Background(), connState, MethodPiListActiveSessions, mustMarshalJSON(t, map[string]any{}))
	if err != nil {
		t.Fatalf("dispatchPi listActive: %v", err)
	}

	summaries, ok := result.([]piActiveSessionSummary)
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

func TestHandlePiAttach_RebindsConnectionAndTabRoutingMetadata(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	h := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	originalConnState := &wsConnState{}
	_, err := h.dispatchPi(context.Background(), originalConnState, MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-attach",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = h.dispatchPi(context.Background(), originalConnState, MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-attach",
		}))
	}()

	reboundConnState := &wsConnState{}
	_, err = h.dispatchPi(context.Background(), reboundConnState, MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-2",
		"cwd":         filepath.Join(homeDir, "worktrees", "pi-project-reopened"),
	}))
	if err != nil {
		t.Fatalf("dispatchPi attach: %v", err)
	}

	h.piSessionsMu.Lock()
	defer h.piSessionsMu.Unlock()
	state := h.piSessions["session-attach"]
	if state == nil {
		t.Fatal("expected pi session state to exist after attach")
	}
	if state.connState != reboundConnState {
		t.Fatalf("expected attach to rebind connState")
	}
	if state.tabID != "tab-reopened" {
		t.Fatalf("expected attach to rebind tabID, got %q", state.tabID)
	}
	if state.workspaceID != "workspace-2" {
		t.Fatalf("expected attach to rebind workspaceID, got %q", state.workspaceID)
	}
	if state.cwd != filepath.Join(homeDir, "worktrees", "pi-project-reopened") {
		t.Fatalf("expected attach to rebind cwd, got %q", state.cwd)
	}
}

func TestHandlePiStart_ReturnsSessionExistsRPCCode(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	h := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &wsConnState{}
	_, err := h.dispatchPi(context.Background(), connState, MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-exists",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = h.dispatchPi(context.Background(), connState, MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-exists",
		}))
	}()

	_, err = h.dispatchPi(context.Background(), connState, MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-exists",
		"tabId":       "tab-2",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err == nil {
		t.Fatal("expected duplicate session error")
	}
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Code != rpcCodeSessionExists {
		t.Fatalf("expected rpc code %d, got %d", rpcCodeSessionExists, rpcErr.Code)
	}
}

func TestBuildPiStartArgs_AppliesDefaultModelOnlyToNewSessions(t *testing.T) {
	tests := []struct {
		name string
		req  piStartParams
		want []string
	}{
		{
			name: "new session with default model",
			req: piStartParams{
				SessionID: "session-new",
				TabID:     "tab-new",
				Model:     "openai-codex/gpt-5.5",
			},
			want: []string{"--mode", "rpc", "--name", "tab-new", "--session-id", "session-new", "--model", "openai-codex/gpt-5.5"},
		},
		{
			name: "resumed session ignores default model",
			req: piStartParams{
				SessionID: "session-resume",
				TabID:     "tab-resume",
				Model:     "openai-codex/gpt-5.5",
				Resume:    true,
			},
			want: []string{"--mode", "rpc", "--name", "tab-resume", "--session", "session-resume"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildPiStartArgs(tt.req)
			if strings.Join(got, "\x00") != strings.Join(tt.want, "\x00") {
				t.Fatalf("buildPiStartArgs() = %#v, want %#v", got, tt.want)
			}
		})
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

func TestBuildPiStartExtraEnv_InjectsNotificationSessionEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(piStartParams{
		TabID:       "tab-2",
		WorkspaceID: "workspace-2",
		PaneID:      "pane-2",
	})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-2", "tab-2", "pane-2", homeDir)
}

func TestBuildPiStartExtraEnv_FallsBackToPaneIDFromTabID(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	extraEnv, err := buildPiStartExtraEnv(piStartParams{
		TabID:       "tab-3",
		WorkspaceID: "workspace-3",
	})
	if err != nil {
		t.Fatalf("buildPiStartExtraEnv: %v", err)
	}

	assertPiStartObserverEnv(t, extraEnv, "workspace-3", "tab-3", "pane-tab-3", homeDir)
}

func assertPiStartObserverEnv(t *testing.T, env []string, workspaceID string, tabID string, paneID string, homeDir string) {
	t.Helper()
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", workspaceID)
	assertEnvValue(t, env, "YISHAN_TAB_ID", tabID)
	assertEnvValue(t, env, "YISHAN_PANE_ID", paneID)
	assertEnvValue(t, env, "YISHAN_NOTIFY_SCRIPT_PATH", filepath.Join(homeDir, ".yishan", "notify.sh"))
}

func assertEnvValue(t *testing.T, env []string, key string, want string) {
	t.Helper()
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			got := strings.TrimPrefix(entry, prefix)
			if got != want {
				t.Fatalf("%s = %q, want %q", key, got, want)
			}
			return
		}
	}
	t.Fatalf("%s missing from env", key)
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

func installBlockingFakePiBinary(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r _ || exit 0\nexit 0\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
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
