package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestBuildTaskRunTerminalTitle(t *testing.T) {
	tests := []struct {
		name      string
		prompt    string
		agentKind string
		want      string
	}{
		{
			name:      "uses prompt when present",
			prompt:    "investigate bug",
			agentKind: "opencode",
			want:      "Task: investigate bug",
		},
		{
			name:      "falls back to agent kind",
			prompt:    "   ",
			agentKind: "claude",
			want:      "Task Run - claude",
		},
		{
			name:      "truncates long prompts",
			prompt:    "1234567890123456789012345678901234567890-extra",
			agentKind: "opencode",
			want:      "Task: 1234567890123456789012345678901234567890",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildTaskRunTerminalTitle(tt.prompt, tt.agentKind); got != tt.want {
				t.Fatalf("buildTaskRunTerminalTitle(%q, %q) = %q, want %q", tt.prompt, tt.agentKind, got, tt.want)
			}
		})
	}
}

func TestHasDesktopUI_TracksDesktopConnections(t *testing.T) {
	s := newTestHandler(t)
	if s.HasDesktopUI() {
		t.Fatal("hasDesktopUI() = true before any desktop connection")
	}

	registerTestDesktopConn(s)
	if !s.HasDesktopUI() {
		t.Fatal("hasDesktopUI() = false with a registered desktop connection")
	}

	s.desktopConnsMu.Lock()
	for connState := range s.desktopConns {
		delete(s.desktopConns, connState)
	}
	s.desktopConnsMu.Unlock()
	if s.HasDesktopUI() {
		t.Fatal("hasDesktopUI() = true after removing the desktop connection")
	}
}

// registerTestDesktopConn registers a fake desktop connection in the handler's
// registry, mirroring the ?client=desktop handshake path used in production.
func registerTestDesktopConn(s *Service) {
	s.desktopConnsMu.Lock()
	s.desktopConns[&rpc.Connection{}] = struct{}{}
	s.desktopConnsMu.Unlock()
}

func TestPiStart_TaskRunSessionEndedBeforeAttachFailsClosed(t *testing.T) {
	s := newTestHandler(t)

	// Simulate a task-run session whose pi process exited before any client
	// attached: the registry still holds the entry (readStdout only unregisters
	// the process manager) while agentMgr has no live session.
	s.piSessions.Register("task-ws-1", nil, nil, "task-ws-1", "ws-1", t.TempDir(), true)

	_, err := s.Start(context.Background(), nil, rpc.PiStartParams{
		SessionID:   "task-ws-1",
		TabID:       "task-ws-1",
		WorkspaceID: "ws-1",
		CWD:         t.TempDir(),
	})
	if err == nil {
		t.Fatal("expected pi.start to fail for a task run session that ended before attach")
	}
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != rpc.CodeNotFound {
		t.Fatalf("error = %v, want rpc.CodeNotFound", err)
	}

	if _, exists := s.piSessions.Get("task-ws-1"); exists {
		t.Fatal("stale task run registry entry was not removed")
	}
}

func TestPublishWorkspaceCreateCompleted_TaskRunUsesChatSession(t *testing.T) {
	for _, hasDesktop := range []bool{true, false} {
		t.Run(fmt.Sprintf("desktop=%t", hasDesktop), func(t *testing.T) {
			testTaskRunChatSession(t, hasDesktop)
		})
	}
}

func testTaskRunChatSession(t *testing.T, hasDesktop bool) {
	s, homeDir, markerPath := prepareTaskRunChatSession(t, hasDesktop)
	completionPayload := publishTaskRunChatSession(t, s)

	if completionPayload["taskRunStatus"] != "started" {
		t.Fatalf("completion taskRunStatus = %#v, want %q", completionPayload["taskRunStatus"], "started")
	}
	if completionPayload["taskRunSessionId"] != "task-ws-1" {
		t.Fatalf("completion taskRunSessionId = %#v, want %q", completionPayload["taskRunSessionId"], "task-ws-1")
	}
	if completionPayload["taskRunTitle"] != "Task: investigate bug" {
		t.Fatalf("completion taskRunTitle = %#v, want %q", completionPayload["taskRunTitle"], "Task: investigate bug")
	}

	// The run must be a Pi session, not a terminal session.
	if _, ok := s.deps.AgentMgr.Session("task-ws-1"); !ok {
		t.Fatal("expected pi session task-ws-1 to be active")
	}
	assertTaskRunChatEnv(t, homeDir, markerPath)
}

func prepareTaskRunChatSession(t *testing.T, hasDesktop bool) (*Service, string, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("YISHAN_DAEMON_WS_URL", "stale")

	// Route "pi" to a fake binary so the test never spawns the real agent.
	fakePiDir := t.TempDir()
	fakePi := filepath.Join(fakePiDir, "pi")
	markerPath := filepath.Join(homeDir, "pi-task-run-env.txt")
	fakePiScript := fmt.Sprintf(`#!/bin/sh
env > %q.tmp && mv %q.tmp %q
printf '%%s\n' "$@" > %q.tmp && mv %q.tmp %q
while IFS= read -r line; do
  printf '%%s\n' "$line" > %q.tmp && mv %q.tmp %q
  printf '%%s\n' '{"type":"session_info","name":"fake-pi-task-run"}'
done
`, markerPath, markerPath, markerPath, markerPath+".args", markerPath+".args", markerPath+".args", markerPath+".prompt", markerPath+".prompt", markerPath+".prompt")
	if err := os.WriteFile(fakePi, []byte(fakePiScript), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", fakePiDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	s := newTestHandler(t)
	s.deps.DaemonWSEndpoint = "ws://127.0.0.1:4312/ws"
	s.deps.Terminals = nil // Any terminal Start or Send would panic, even if it failed.
	if hasDesktop {
		registerTestDesktopConn(s)
	}
	t.Cleanup(func() { s.cleanupTaskRunSession("task-ws-1") })

	return s, homeDir, markerPath
}

func publishTaskRunChatSession(t *testing.T, s *Service) map[string]any {
	t.Helper()
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	root := t.TempDir()
	s.PublishWorkspaceCreateCompleted(
		application.CreatePlan{
			LocalCreate: &workspace.CreateRequest{
				TaskRun: &workspace.TaskRunConfig{
					AgentKind: "opencode",
					Model:     " provider/model ",
					Prompt:    "investigate bug",
				},
			},
		},
		workspace.Workspace{ID: "ws-1", Path: root, ProjectID: "project-1", OrgID: "org-1"},
		nil,
	)

	var completionPayload map[string]any
	deadline := time.After(5 * time.Second)
	for completionPayload == nil {
		select {
		case event := <-events:
			if event.Topic == "workspaceCreateCompleted" {
				completionPayload, _ = event.Payload.(map[string]any)
			}
		case <-deadline:
			t.Fatal("timed out waiting for workspaceCreateCompleted event")
		}
	}

	return completionPayload
}

func assertTaskRunChatEnv(t *testing.T, homeDir, markerPath string) {
	t.Helper()
	env := strings.Split(waitForFileContent(t, markerPath), "\n")
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", "ws-1")
	assertEnvValue(t, env, "YISHAN_PROJECT_ID", "project-1")
	assertEnvValue(t, env, "YISHAN_ORG_ID", "org-1")
	assertEnvValue(t, env, "YISHAN_TAB_ID", "task-ws-1")
	assertEnvValue(t, env, "YISHAN_PANE_ID", "pane-task-ws-1")
	assertEnvValue(t, env, "PI_CODING_AGENT_DIR", filepath.Join(homeDir, ".yishan", "pi", "agent"))
	assertEnvValue(t, env, "YISHAN_DAEMON_WS_URL", "ws://127.0.0.1:4312/ws")
	args := waitForFileContent(t, markerPath+".args")
	if args != "--mode\nrpc\n--name\ntask-ws-1\n--approve\n--session-id\ntask-ws-1\n--model\nprovider/model\n" {
		t.Fatalf("pi args = %q", args)
	}
	prompt := waitForFileContent(t, markerPath+".prompt")
	if strings.TrimSpace(prompt) != `{"message":"investigate bug","type":"prompt"}` {
		t.Fatalf("prompt = %q", prompt)
	}

}
