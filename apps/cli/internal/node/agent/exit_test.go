package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
)

func TestPiSessionExit_ForwardsSessionEndOnProcessExit(t *testing.T) {
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

func TestPiSessionExit_SkipsSessionSupersededByNewerProcess(t *testing.T) {
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
