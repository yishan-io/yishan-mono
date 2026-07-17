package daemon

import (
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"
)

func TestPublishWorkspaceCreateCompleted_TaskRunUsesTerminalLifecycleMetadata(t *testing.T) {
	root := t.TempDir()
	handler := NewJSONRPCHandler(
		workspace.NewManager(),
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()

	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

	handler.publishWorkspaceCreateCompleted(
		preparedWorkspaceCreate{
			localCreate: &workspace.CreateRequest{
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

func stopAllTerminalSessions(handler *JSONRPCHandler) {
	sessions := handler.manager.Terminals().ListSessions(terminal.ListSessionsRequest{IncludeExited: true})
	for _, session := range sessions {
		_, _ = handler.manager.Terminals().Stop(terminal.StopRequest{SessionID: session.SessionID})
	}
}
