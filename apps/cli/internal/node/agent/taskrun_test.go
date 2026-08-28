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

	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestPublishWorkspaceCreateCompleted_TaskRunUsesTerminalLifecycleMetadata(t *testing.T) {
	root := t.TempDir()
	handler := newTestService(t, nil, "node-1")

	subscriptionID, events := handler.deps.Events.Subscribe()
	defer handler.deps.Events.Unsubscribe(subscriptionID)

	handler.PublishWorkspaceCreateCompleted(
		application.CreatePlan{
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

func TestPublishWorkspaceCreateCompleted_TaskRunUsesChatSessionWhenDesktopConnected(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	// Route "pi" to a fake binary so the test never spawns the real agent.
	fakePiDir := t.TempDir()
	fakePi := filepath.Join(fakePiDir, "pi")
	markerPath := filepath.Join(homeDir, "pi-task-run-env.txt")
	fakePiScript := fmt.Sprintf(`#!/bin/sh
env > %q.tmp && mv %q.tmp %q
while IFS= read -r line; do
  printf '%%s\n' '{"type":"session_info","name":"fake-pi-task-run"}'
done
`, markerPath, markerPath, markerPath)
	if err := os.WriteFile(fakePi, []byte(fakePiScript), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", fakePiDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	s := newTestHandler(t)
	s.deps.DaemonWSEndpoint = "ws://127.0.0.1:4312/ws"
	// Simulate a connected Yishan desktop UI: task runs switch to chat mode.
	registerTestDesktopConn(s)

	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	root := t.TempDir()
	s.PublishWorkspaceCreateCompleted(
		application.CreatePlan{
			LocalCreate: &workspace.CreateRequest{
				TaskRun: &workspace.TaskRunConfig{
					AgentKind: "pi",
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

	if completionPayload["taskRunStatus"] != "started" {
		t.Fatalf("completion taskRunStatus = %#v, want %q", completionPayload["taskRunStatus"], "started")
	}
	if completionPayload["taskRunSessionId"] != "task-ws-1" {
		t.Fatalf("completion taskRunSessionId = %#v, want %q", completionPayload["taskRunSessionId"], "task-ws-1")
	}
	if completionPayload["taskRunTabId"] != "task-ws-1" {
		t.Fatalf("completion taskRunTabId = %#v, want %q", completionPayload["taskRunTabId"], "task-ws-1")
	}
	if completionPayload["taskRunTitle"] != "Task: investigate bug" {
		t.Fatalf("completion taskRunTitle = %#v, want %q", completionPayload["taskRunTitle"], "Task: investigate bug")
	}
	if completionPayload["taskRunRuntime"] != "pi" {
		t.Fatalf("completion taskRunRuntime = %#v, want %q", completionPayload["taskRunRuntime"], "pi")
	}

	// The run must be a Pi session, not a terminal session.
	if _, ok := s.deps.AgentMgr.Session("task-ws-1"); !ok {
		t.Fatal("expected pi session task-ws-1 to be active")
	}
	if sessions := s.deps.Terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true}); len(sessions) != 0 {
		t.Fatalf("chat-mode task run started terminal sessions: %#v", sessions)
	}

	env := strings.Split(waitForFileContent(t, markerPath), "\n")
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", "ws-1")
	assertEnvValue(t, env, "YISHAN_PROJECT_ID", "project-1")
	assertEnvValue(t, env, "YISHAN_ORG_ID", "org-1")
	assertEnvValue(t, env, "YISHAN_TAB_ID", "task-ws-1")
	assertEnvValue(t, env, "YISHAN_PANE_ID", "pane-task-ws-1")
	assertEnvValue(t, env, "PI_CODING_AGENT_DIR", filepath.Join(homeDir, ".yishan", "pi", "agent"))
	assertEnvValue(t, env, "YISHAN_DAEMON_WS_URL", "ws://127.0.0.1:4312/ws")
}

func TestPublishWorkspaceCreateCompleted_HeadlessTaskRunInjectsEndpointAndOwnership(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("YISHAN_DAEMON_WS_URL", "stale")
	markerPath := filepath.Join(homeDir, "headless-task-run-env.txt")
	fakePiDir := t.TempDir()
	fakePi := filepath.Join(fakePiDir, "pi")
	fakePiScript := fmt.Sprintf("#!/bin/sh\nenv > %q.tmp && mv %q.tmp %q\n", markerPath, markerPath, markerPath)
	if err := os.WriteFile(fakePi, []byte(fakePiScript), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", fakePiDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	s := newTestHandler(t)
	endpoint := "ws://127.0.0.1:4312/ws"
	s.deps.DaemonWSEndpoint = endpoint
	s.deps.Terminals.SetDaemonWSEndpoint(endpoint)
	workspacePath := t.TempDir()
	s.PublishWorkspaceCreateCompleted(application.CreatePlan{
		LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{AgentKind: "pi", Prompt: "investigate bug"}},
	}, workspace.Workspace{ID: "ws-headless", Path: workspacePath, ProjectID: "project-headless", OrgID: "org-headless"}, nil)
	defer stopAllTerminalSessions(s)

	env := strings.Split(waitForFileContent(t, markerPath), "\n")
	assertEnvValue(t, env, "YISHAN_DAEMON_WS_URL", endpoint)
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", "ws-headless")
	assertEnvValue(t, env, "YISHAN_PROJECT_ID", "project-headless")
	assertEnvValue(t, env, "YISHAN_ORG_ID", "org-headless")
}

func TestPublishWorkspaceCreateCompleted_DSHStartsBoundSessionAndPublishesTabMetadata(t *testing.T) {
	runtime := &recordingDSHSessions{}
	s := newTestHandler(t)
	s.deps.DSH = runtime
	s.deps.OwnerNodeID = "node-1"
	workspacePath := t.TempDir()
	s.deps.Workspace = testWorkspaceResolver(func(id string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: id, ProjectID: "project-1", OrgID: "org-1", Path: workspacePath}, nil
	})

	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)
	s.PublishWorkspaceCreateCompleted(application.CreatePlan{LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{
		Runtime: workspace.TaskRunRuntimeDSH, AgentKind: "pi", Prompt: "investigate bug",
	}}}, workspace.Workspace{ID: "ws-1", ProjectID: "project-1", OrgID: "org-1", Path: workspacePath}, nil)

	completion := waitForTaskRunCompletion(t, events)
	if runtime.startRequest.SessionID != "task-ws-1" || runtime.startRequest.CWD != workspacePath {
		t.Fatalf("DSH start request = %#v", runtime.startRequest)
	}
	if runtime.startRequest.Binding.WorkspaceID != "ws-1" || runtime.startRequest.Binding.OwnerNodeID != "node-1" {
		t.Fatalf("DSH binding = %#v", runtime.startRequest.Binding)
	}
	if runtime.promptRequest.SessionID != "task-ws-1" || runtime.promptRequest.ContentBlocks[0].Text != "investigate bug" {
		t.Fatalf("DSH prompt request = %#v", runtime.promptRequest)
	}
	if completion["taskRunRuntime"] != "dsh" || completion["taskRunSessionId"] != "task-ws-1" || completion["taskRunTabId"] != "task-ws-1" {
		t.Fatalf("completion = %#v", completion)
	}
	if _, ok := s.deps.AgentMgr.Session("task-ws-1"); ok {
		t.Fatal("DSH task run started a Pi process")
	}
	if sessions := s.deps.Terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true}); len(sessions) != 0 {
		t.Fatalf("DSH task run started terminals: %#v", sessions)
	}
}

func TestPublishWorkspaceCreateCompleted_RelayedDSHTaskRunUsesTerminalFallback(t *testing.T) {
	runtime := &recordingDSHSessions{}
	s := newTestHandler(t)
	s.deps.DSH = runtime
	workspacePath := t.TempDir()
	s.deps.Workspace = testWorkspaceResolver(func(id string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: id, Path: workspacePath}, nil
	})
	registerTestDesktopConn(s)

	s.PublishWorkspaceCreateCompleted(application.CreatePlan{
		IsRelayed: true,
		LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{
			Runtime: workspace.TaskRunRuntimeDSH, AgentKind: "pi", Prompt: "investigate bug",
		}},
	}, workspace.Workspace{ID: "ws-relayed", Path: workspacePath}, nil)
	defer stopAllTerminalSessions(s)

	if runtime.startRequest.SessionID != "" || runtime.promptRequest.SessionID != "" {
		t.Fatalf("relayed task run started DSH: start=%#v prompt=%#v", runtime.startRequest, runtime.promptRequest)
	}
	if _, ok := s.deps.AgentMgr.Session("task-ws-relayed"); ok {
		t.Fatal("relayed task run started a Pi session")
	}
	if sessions := s.deps.Terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true}); len(sessions) != 1 {
		t.Fatalf("terminal sessions = %#v, want one terminal fallback", sessions)
	}
}

func TestPublishWorkspaceCreateCompleted_DSHPromptFailureDisposesSession(t *testing.T) {
	runtime := &recordingDSHSessions{promptErr: errors.New("prompt failed")}
	s := newTestHandler(t)
	s.deps.DSH = runtime
	workspacePath := t.TempDir()
	s.deps.Workspace = testWorkspaceResolver(func(id string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: id, Path: workspacePath}, nil
	})
	s.PublishWorkspaceCreateCompleted(application.CreatePlan{LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{Runtime: workspace.TaskRunRuntimeDSH, AgentKind: "pi", Prompt: "run"}}}, workspace.Workspace{ID: "ws-1", Path: workspacePath}, nil)
	if runtime.disposeCount != 1 || runtime.disposeCWD != workspacePath {
		t.Fatalf("dispose count/cwd = %d/%q, want 1/%q", runtime.disposeCount, runtime.disposeCWD, workspacePath)
	}
}

func TestPublishWorkspaceCreateCompleted_DSHStartFailureDisposesSession(t *testing.T) {
	runtime := &recordingDSHSessions{subscribeErr: errors.New("subscribe failed")}
	s := newTestHandler(t)
	s.deps.DSH = runtime
	workspacePath := t.TempDir()
	s.deps.Workspace = testWorkspaceResolver(func(id string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: id, Path: workspacePath}, nil
	})
	s.PublishWorkspaceCreateCompleted(application.CreatePlan{LocalCreate: &workspace.CreateRequest{TaskRun: &workspace.TaskRunConfig{Runtime: workspace.TaskRunRuntimeDSH, AgentKind: "pi", Prompt: "run"}}}, workspace.Workspace{ID: "ws-1", Path: workspacePath}, nil)
	if runtime.disposeCount != 1 || runtime.promptRequest.SessionID != "" {
		t.Fatalf("dispose count = %d, prompt = %#v", runtime.disposeCount, runtime.promptRequest)
	}
}

func waitForTaskRunCompletion(t *testing.T, events <-chan eventbus.Event) map[string]any {
	t.Helper()
	select {
	case event := <-events:
		payload, ok := event.Payload.(map[string]any)
		if !ok || event.Topic != "workspaceCreateCompleted" {
			t.Fatalf("event = %#v", event)
		}
		return payload
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for task run completion")
	}
	return nil
}
