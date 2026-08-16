package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/rpc"
)

func TestHandlePiListSessions_ReturnsSummaries(t *testing.T) {
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

func TestHandlePiListSessions_ReadsSessionInfoName(t *testing.T) {
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

func TestHandlePiListSessions_RequiresCWD(t *testing.T) {
	s := newTestHandler(t)
	_, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiListSessions, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error for missing cwd")
	}
}

func TestHandlePiGetSessionFile_ReturnsMatchingTranscriptPath(t *testing.T) {
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

func TestHandlePiGetSessionFile_EmptyWhenNoTranscript(t *testing.T) {
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

func TestHandlePiGetSessionFile_RequiresCWDAndSessionID(t *testing.T) {
	s := newTestHandler(t)

	_, err := s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, json.RawMessage(`{}`))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)

	_, err = s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{"sessionId": "session-abc"}))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)

	_, err = s.callAgentRPCForTest(context.Background(), nil, rpc.MethodPiGetSessionFile, mustMarshalJSON(t, map[string]any{"cwd": "/tmp"}))
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)
}

func TestHandlePiListActiveSessions_ReturnsLiveSessions(t *testing.T) {
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

func TestHandlePiAttach_RebindsConnectionAndTabRoutingMetadata(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	originalConnState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), originalConnState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-attach",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = s.callAgentRPCForTest(context.Background(), originalConnState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-attach",
		}))
	}()

	reboundConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reboundConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-2",
		"cwd":         filepath.Join(homeDir, "worktrees", "pi-project-reopened"),
	}))
	if err != nil {
		t.Fatalf("dispatchPi attach: %v", err)
	}

	state, _ := s.piSessions.Get("session-attach")
	if state == nil {
		t.Fatal("expected pi session state to exist after attach")
	}
	if state.Conn != reboundConnState {
		t.Fatalf("expected attach to rebind connState")
	}
	if state.TabID != "tab-reopened" {
		t.Fatalf("expected attach to rebind tabID, got %q", state.TabID)
	}
	if state.WorkspaceID != "workspace-2" {
		t.Fatalf("expected attach to rebind workspaceID, got %q", state.WorkspaceID)
	}
	if state.CWD != filepath.Join(homeDir, "worktrees", "pi-project-reopened") {
		t.Fatalf("expected attach to rebind cwd, got %q", state.CWD)
	}
}

func TestHandlePiStart_ConnectionContextCancellationKeepsSessionAlive(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connectionCtx, cancelConnection := context.WithCancel(context.Background())
	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(connectionCtx, connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-survives-disconnect",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	cancelConnection()
	time.Sleep(100 * time.Millisecond)

	session, exists := s.deps.AgentMgr.Session("session-survives-disconnect")
	if !exists {
		t.Fatal("expected pi session to remain active after its WebSocket context was cancelled")
	}

	reconnectedConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reconnectedConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-survives-disconnect",
		"tabId":     "tab-reconnected",
	}))
	if err != nil {
		t.Fatalf("dispatchPi attach after reconnect: %v", err)
	}

	s.Shutdown()
	if _, exists := s.deps.AgentMgr.Session(session.ID()); exists {
		t.Fatal("pi session remained active after daemon shutdown")
	}
	if _, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-after-shutdown",
		"tabId":       "tab-2",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	})); err == nil {
		t.Fatal("expected pi start to be rejected after daemon shutdown")
	}
}

func TestHandlePiStart_ReturnsSessionExistsRPCCode(t *testing.T) {
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
		"sessionId":   "session-exists",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}
	defer func() {
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-exists",
		}))
	}()

	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-exists",
		"tabId":       "tab-2",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err == nil {
		t.Fatal("expected duplicate session error")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Code != rpc.CodeSessionExists {
		t.Fatalf("expected rpc code %d, got %d", rpc.CodeSessionExists, rpcErr.Code)
	}
}

func TestHandlePiStart_OverridesLegacyAgentDirEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	legacyAgentDir := filepath.Join(homeDir, ".yishan")
	t.Setenv(config.PiAgentDirEnvKey, legacyAgentDir)

	markerPath := filepath.Join(homeDir, "pi-agent-dir.txt")
	installFakePiBinary(t, markerPath)

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

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
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

	extraEnv, err := buildPiStartExtraEnv(rpc.PiStartParams{
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

// testEncodeSessionCWD mirrors agentmanager.encodeSessionCWD (which matches pi's
// getDefaultSessionDirPath encoding) so tests can construct session dirs the
// daemon handlers will resolve. Keep in sync when the encoding changes.
func testEncodeSessionCWD(cwd string) string {
	cleanCWD := strings.TrimSpace(cwd)
	absoluteCWD, err := filepath.Abs(cleanCWD)
	if err != nil {
		absoluteCWD = filepath.Clean(cleanCWD)
	}
	normalized := filepath.ToSlash(absoluteCWD)
	normalized = strings.TrimPrefix(normalized, "/")
	normalized = strings.ReplaceAll(normalized, ":", "-")
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

// installSlowExitFakePiBinary installs a pi binary that stays alive after its
// stdin closes, so a pi.stop teardown has to wait out abortGracePeriod before
// force-killing — giving tests a deterministic "session is stopping" window.
func installSlowExitFakePiBinary(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r _ || true\nsleep 5\nexit 0\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func waitForStoppingMarker(t *testing.T, services *Service, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if services.piSessions.IsStopping(sessionID) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for stopping marker for %q", sessionID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitForStartingReservation(t *testing.T, services *Service, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if services.deps.AgentMgr.Starting(sessionID) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for start reservation for %q", sessionID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestHandlePiAttach_WaitsForConcurrentStart(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	// Hold the winner's Start in its reservation window (id in `starting`, not
	// yet in `sessions`), exactly the state a second tab's attach races.
	releaseGate := make(chan struct{})
	agentmanager.StartGate = func() {
		<-releaseGate
	}
	t.Cleanup(func() { agentmanager.StartGate = nil })

	startDone := make(chan struct{})
	go func() {
		defer close(startDone)
		_, _ = s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
			"sessionId":   "session-concurrent",
			"tabId":       "tab-1",
			"workspaceId": "workspace-1",
			"cwd":         cwd,
		}))
	}()
	waitForStartingReservation(t, s, "session-concurrent")

	// A second opener attaches while the start is still in flight: it must wait
	// for the start to finish and then bind to the winning process.
	attachConnState := &rpc.Connection{}
	attachDone := make(chan error, 1)
	go func() {
		_, err := s.callAgentRPCForTest(context.Background(), attachConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
			"sessionId":   "session-concurrent",
			"tabId":       "tab-2",
			"workspaceId": "workspace-1",
			"cwd":         cwd,
		}))
		attachDone <- err
	}()

	// The attach must not fail (or resolve) while the start is still reserved.
	select {
	case err := <-attachDone:
		t.Fatalf("attach resolved before the start finished: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	close(releaseGate)
	<-startDone
	if err := <-attachDone; err != nil {
		t.Fatalf("attach during concurrent start: %v", err)
	}

	// The winner's registry entry must be intact and owned by the attached tab.
	state, exists := s.piSessions.Get("session-concurrent")
	if !exists {
		t.Fatal("expected the concurrent start's session to remain registered")
	}
	if state.Conn != attachConnState {
		t.Fatal("expected the attaching tab to own the session after the wait")
	}
}

func TestHandlePiStart_WaitsForStoppingSessionThenStartsFresh(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}

	// Close the session in the background so the teardown is in flight when the
	// reopen's pi.start arrives.
	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-race",
		}))
	}()
	waitForStoppingMarker(t, s, "session-race")

	// A reopen of the same id during the teardown must wait and then start a
	// fresh process instead of failing with ErrSessionExists.
	startStartedAt := time.Now()
	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start during stop: %v", err)
	}
	if time.Since(startStartedAt) < 200*time.Millisecond {
		t.Fatalf("expected pi.start to wait for the in-flight stop, took %v", time.Since(startStartedAt))
	}
	<-stopDone

	if _, exists := s.deps.AgentMgr.Session("session-race"); !exists {
		t.Fatal("expected a fresh session after the reopen")
	}
	state, exists := s.piSessions.Get("session-race")
	if !exists || state.TabID != "tab-reopened" {
		t.Fatalf("expected reopened tab to own the fresh session, got %#v", state)
	}
}

func TestHandlePiStart_RetriesWhenStopMarkerArrivesLate(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race-late",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("first dispatchPi start: %v", err)
	}

	// Dispatch the stop and the reopen back-to-back WITHOUT waiting for the
	// stopping marker: pi.start's first attempt may see ErrSessionExists before
	// the marker is set. It must retry after the teardown and start fresh.
	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-race-late",
		}))
	}()

	_, err = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-race-late",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start racing a late stop marker: %v", err)
	}
	<-stopDone

	if _, exists := s.deps.AgentMgr.Session("session-race-late"); !exists {
		t.Fatal("expected a fresh session after the retried reopen")
	}
	state, exists := s.piSessions.Get("session-race-late")
	if !exists || state.TabID != "tab-reopened" {
		t.Fatalf("expected reopened tab to own the fresh session, got %#v", state)
	}
}

func TestHandlePiAttach_RejectsStoppingSession(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installSlowExitFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach-stop",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}

	stopDone := make(chan struct{})
	go func() {
		defer close(stopDone)
		_, _ = s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
			"sessionId": "session-attach-stop",
		}))
	}()
	waitForStoppingMarker(t, s, "session-attach-stop")

	// Attach during the teardown must not rebind a doomed process.
	reboundConnState := &rpc.Connection{}
	_, err = s.callAgentRPCForTest(context.Background(), reboundConnState, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-attach-stop",
		"tabId":       "tab-reopened",
		"workspaceId": "workspace-2",
		"cwd":         cwd,
	}))
	if err == nil {
		t.Fatal("expected attach to be rejected while the session is stopping")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Code != rpc.CodeNotFound {
		t.Fatalf("expected rpc code %d, got %d", rpc.CodeNotFound, rpcErr.Code)
	}

	// The rejected attach must not have rebound the connection or routing
	// metadata: while the entry still exists (the in-flight stop may have
	// already deleted it), the original tab must still own the session.
	state, exists := s.piSessions.Get("session-attach-stop")
	if exists {
		if state.Conn != connState {
			t.Fatal("expected the rejected attach to leave connState unchanged")
		}
		if state.TabID != "tab-1" {
			t.Fatalf("expected the rejected attach to leave tabID unchanged, got %q", state.TabID)
		}
	}

	<-stopDone
}

func newTestWSConnState(t *testing.T) (*rpc.Connection, *websocket.Conn) {
	t.Helper()
	upgrader := websocket.Upgrader{}
	serverConns := make(chan *websocket.Conn, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("websocket upgrade failed: %v", err)
			return
		}
		serverConns <- conn
	}))
	t.Cleanup(server.Close)

	clientConn, _, err := websocket.DefaultDialer.Dial(strings.Replace(server.URL, "http://", "ws://", 1), nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	t.Cleanup(func() { _ = clientConn.Close() })

	var serverConn *websocket.Conn
	select {
	case serverConn = <-serverConns:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server websocket upgrade")
	}
	t.Cleanup(func() { _ = serverConn.Close() })

	return rpc.NewConnection(serverConn), clientConn
}

func TestHandlePiSessionExit_ForwardsSessionEndOnProcessExit(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState, clientConn := newTestWSConnState(t)
	if _, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId":   "session-1",
		"tabId":       "tab-1",
		"workspaceId": "workspace-1",
		"cwd":         cwd,
	})); err != nil {
		t.Fatalf("pi.start: %v", err)
	}

	// Stopping the process triggers the exit hook, which must notify the
	// desktop that the session ended.
	if _, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-1",
	})); err != nil {
		t.Fatalf("pi.stop: %v", err)
	}

	if err := clientConn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	_, message, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("read session_end notification: %v", err)
	}

	var notification struct {
		Method string         `json:"method"`
		Params map[string]any `json:"params"`
	}
	if err := json.Unmarshal(message, &notification); err != nil {
		t.Fatalf("unmarshal notification: %v", err)
	}
	if notification.Method != rpc.MethodFrontendEventsStream {
		t.Fatalf("method = %q, want %q", notification.Method, rpc.MethodFrontendEventsStream)
	}
	if notification.Params["topic"] != "agent.pi.event" {
		t.Fatalf("topic = %v, want agent.pi.event", notification.Params["topic"])
	}
	payload, ok := notification.Params["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload type = %T, want map", notification.Params["payload"])
	}
	event, ok := payload["event"].(map[string]any)
	if !ok || event["type"] != "session_end" {
		t.Fatalf("event = %#v, want session_end", payload["event"])
	}
	if payload["sessionId"] != "session-1" || payload["tabId"] != "tab-1" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestHandlePiSessionExit_SkipsSessionSupersededByNewerProcess(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)

	s := newTestHandler(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}

	connState, clientConn := newTestWSConnState(t)
	for _, sessionID := range []string{"session-1", "session-2"} {
		if _, err := s.callAgentRPCForTest(context.Background(), connState, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
			"sessionId":   sessionID,
			"tabId":       "tab-1",
			"workspaceId": "workspace-1",
			"cwd":         cwd,
		})); err != nil {
			t.Fatalf("pi.start %s: %v", sessionID, err)
		}
	}

	oldSession, ok := s.deps.AgentMgr.Session("session-1")
	if !ok {
		t.Fatal("expected session-1 to be registered")
	}
	newSession, ok := s.deps.AgentMgr.Session("session-2")
	if !ok {
		t.Fatal("expected session-2 to be registered")
	}

	// A newer process took over session-1's registry entry before the old one
	// exited. The old process's exit must not notify the desktop.
	s.piSessions.SetProcess("session-1", newSession)

	s.handlePiSessionExit(oldSession)

	if err := clientConn.SetReadDeadline(time.Now().Add(300 * time.Millisecond)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	if _, _, err := clientConn.ReadMessage(); err == nil {
		t.Fatal("expected no notification for a superseded session")
	}
}
