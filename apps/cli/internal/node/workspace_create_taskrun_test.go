package node

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
)

func TestPublishWorkspaceCreateCompleted_TaskRunUsesTerminalLifecycleMetadata(t *testing.T) {
	root := t.TempDir()
	handler := newTestService(t, nil, "node-1")

	subscriptionID, events := handler.deps.Events.Subscribe()
	defer handler.deps.Events.Unsubscribe(subscriptionID)

	handler.publishWorkspaceCreateCompleted(
		preparedWorkspaceCreate{
			LocalCreate: &workspace.CreateRequest{
				TaskRun: &workspace.TaskRunConfig{
					AgentKind: "opencode",
					Prompt:    "investigate bug",
				},
			},
		},
		workspace.Workspace{ID: "ws-1", Path: root},
		nil,
	)
	defer stopAllTerminalSessions(handler)

	var terminalPayload map[string]any
	var completionPayload map[string]any
	deadline := time.After(3 * time.Second)
	for terminalPayload == nil || completionPayload == nil {
		select {
		case event := <-events:
			switch event.Topic {
			case "terminalSessionChanged":
				payload, ok := event.Payload.(map[string]any)
				if !ok {
					t.Fatalf("terminalSessionChanged payload type = %T, want map[string]any", event.Payload)
				}
				if payload["action"] == "created" {
					terminalPayload = payload
				}
			case "workspaceCreateCompleted":
				payload, ok := event.Payload.(map[string]any)
				if !ok {
					t.Fatalf("workspaceCreateCompleted payload type = %T, want map[string]any", event.Payload)
				}
				completionPayload = payload
			}
		case <-deadline:
			t.Fatal("timed out waiting for terminalSessionChanged + workspaceCreateCompleted events")
		}
	}

	if terminalPayload["workspaceId"] != "ws-1" {
		t.Fatalf("terminal workspaceId = %#v, want %q", terminalPayload["workspaceId"], "ws-1")
	}
	if terminalPayload["tabId"] != "task-ws-1" {
		t.Fatalf("terminal tabId = %#v, want %q", terminalPayload["tabId"], "task-ws-1")
	}
	if terminalPayload["paneId"] != "pane-task-ws-1" {
		t.Fatalf("terminal paneId = %#v, want %q", terminalPayload["paneId"], "pane-task-ws-1")
	}
	if terminalPayload["title"] != "Task: investigate bug" {
		t.Fatalf("terminal title = %#v, want %q", terminalPayload["title"], "Task: investigate bug")
	}
	if terminalPayload["agentKind"] != "opencode" {
		t.Fatalf("terminal agentKind = %#v, want %q", terminalPayload["agentKind"], "opencode")
	}

	if completionPayload["workspaceId"] != "ws-1" {
		t.Fatalf("completion workspaceId = %#v, want %q", completionPayload["workspaceId"], "ws-1")
	}
	if completionPayload["worktreePath"] != root {
		t.Fatalf("completion worktreePath = %#v, want %q", completionPayload["worktreePath"], root)
	}
	if completionPayload["taskRunStatus"] != "started" {
		t.Fatalf("completion taskRunStatus = %#v, want %q", completionPayload["taskRunStatus"], "started")
	}
	if _, ok := completionPayload["taskRunSessionId"]; ok {
		t.Fatalf("completion payload unexpectedly included taskRunSessionId: %+v", completionPayload)
	}
	if _, ok := completionPayload["taskRunTabId"]; ok {
		t.Fatalf("completion payload unexpectedly included taskRunTabId: %+v", completionPayload)
	}
}

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

func stopAllTerminalSessions(handler *Service) {
	sessions := handler.deps.Terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true})
	for _, session := range sessions {
		_, _ = handler.deps.Terminals.Stop(terminal.StopRequest{SessionID: session.SessionID})
	}
}

func TestHasDesktopUI_TracksDesktopConnections(t *testing.T) {
	s := newTestHandler(t)
	if s.hasDesktopUI() {
		t.Fatal("hasDesktopUI() = true before any desktop connection")
	}

	registerTestDesktopConn(s)
	if !s.hasDesktopUI() {
		t.Fatal("hasDesktopUI() = false with a registered desktop connection")
	}

	s.desktopConnsMu.Lock()
	for connState := range s.desktopConns {
		delete(s.desktopConns, connState)
	}
	s.desktopConnsMu.Unlock()
	if s.hasDesktopUI() {
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

func TestHandlePiStart_TaskRunSessionEndedBeforeAttachFailsClosed(t *testing.T) {
	s := newTestHandler(t)

	// Simulate a task-run session whose pi process exited before any client
	// attached: the registry still holds the entry (readStdout only unregisters
	// the process manager) while agentMgr has no live session.
	s.piSessions.Register("task-ws-1", nil, nil, "task-ws-1", "ws-1", t.TempDir(), true)

	_, err := s.PiStart(context.Background(), nil, rpc.PiStartParams{
		SessionID:   "task-ws-1",
		TabID:       "task-ws-1",
		WorkspaceID: "ws-1",
		CWD:         t.TempDir(),
	})
	if err == nil {
		t.Fatal("expected pi.start to fail for a task run session that ended before attach")
	}
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) || rpcErr.Code != rpcerror.CodeNotFound {
		t.Fatalf("error = %v, want rpcerror.CodeNotFound", err)
	}

	if _, exists := s.piSessions.Get("task-ws-1"); exists {
		t.Fatal("stale task run registry entry was not removed")
	}
}

func TestPublishWorkspaceCreateCompleted_TaskRunUsesChatSessionWhenDesktopConnected(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	// Route "pi" to a fake binary so the test never spawns the real agent.
	fakePiDir := t.TempDir()
	fakePi := filepath.Join(fakePiDir, "pi")
	fakePiScript := `#!/bin/sh
while IFS= read -r line; do
  printf '%s\n' '{"type":"session_info","name":"fake-pi-task-run"}'
done
`
	if err := os.WriteFile(fakePi, []byte(fakePiScript), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", fakePiDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	s := newTestHandler(t)
	// Simulate a connected Yishan desktop UI: task runs switch to chat mode.
	registerTestDesktopConn(s)

	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	root := t.TempDir()
	s.publishWorkspaceCreateCompleted(
		preparedWorkspaceCreate{
			LocalCreate: &workspace.CreateRequest{
				TaskRun: &workspace.TaskRunConfig{
					AgentKind: "pi",
					Prompt:    "investigate bug",
				},
			},
		},
		workspace.Workspace{ID: "ws-1", Path: root},
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
	if sessions := s.deps.Terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true}); len(sessions) != 0 {
		t.Fatalf("chat-mode task run started terminal sessions: %#v", sessions)
	}
}
