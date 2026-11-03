package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"

	"github.com/spf13/cobra"
)

func TestBuildWorkspaceCreateRPCRequest(t *testing.T) {
	originalConfig := appConfig
	appConfig.DefaultOrgID = "org-default"
	defer func() {
		appConfig = originalConfig
	}()

	cmd := newWorkspaceCreateTestCommand()
	cmd.Flags().Set("project-id", "proj-1")
	cmd.Flags().Set("kind", string(workspace.KindWorktree))
	cmd.Flags().Set("branch", "feature/test")
	cmd.Flags().Set("source-branch", "main")
	cmd.Flags().Set("name", "feature-test")
	cmd.Flags().Set("target-node", "node-2")
	cmd.Flags().Set("task-run-prompt", "fix bug")
	cmd.Flags().Set("task-run-model", "sonnet")

	request, err := buildWorkspaceCreateRPCRequest(cmd)
	if err != nil {
		t.Fatalf("buildWorkspaceCreateRPCRequest: %v", err)
	}

	if request.OrganizationID != "org-default" {
		t.Fatalf("OrganizationID = %q, want %q", request.OrganizationID, "org-default")
	}
	if request.ProjectID != "proj-1" {
		t.Fatalf("ProjectID = %q, want %q", request.ProjectID, "proj-1")
	}
	if request.NodeID != "node-2" {
		t.Fatalf("NodeID = %q, want %q", request.NodeID, "node-2")
	}
	if request.Kind != string(workspace.KindWorktree) {
		t.Fatalf("Kind = %q, want %q", request.Kind, string(workspace.KindWorktree))
	}
	if request.Branch != "feature/test" {
		t.Fatalf("Branch = %q, want %q", request.Branch, "feature/test")
	}
	if request.SourceBranch != "main" {
		t.Fatalf("SourceBranch = %q, want %q", request.SourceBranch, "main")
	}
	if request.WorkspaceName != "feature-test" {
		t.Fatalf("WorkspaceName = %q, want %q", request.WorkspaceName, "feature-test")
	}
	if request.TaskRun == nil {
		t.Fatal("TaskRun = nil, want config")
	}
	if request.TaskRun.AgentKind != "" || request.TaskRun.Prompt != "fix bug" || request.TaskRun.Model != "sonnet" {
		t.Fatalf("TaskRun = %#v, want empty/fix bug/sonnet so the daemon defaults to pi", request.TaskRun)
	}
}

func TestBuildWorkspaceCreateRPCRequest_RejectsPrimaryWorkspaceCreate(t *testing.T) {
	originalConfig := appConfig
	appConfig.DefaultOrgID = "org-default"
	defer func() {
		appConfig = originalConfig
	}()

	cmd := newWorkspaceCreateTestCommand()
	cmd.Flags().Set("project-id", "proj-1")
	cmd.Flags().Set("kind", string(workspace.KindPrimary))

	_, err := buildWorkspaceCreateRPCRequest(cmd)
	want := "workspace create only supports worktree workspaces; create a new project to create a primary workspace"
	if err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
}

func TestBuildWorkspaceCreateRPCRequest_RejectsLocalPathWorkspaceCreate(t *testing.T) {
	originalConfig := appConfig
	appConfig.DefaultOrgID = "org-default"
	defer func() {
		appConfig = originalConfig
	}()

	cmd := newWorkspaceCreateTestCommand()
	cmd.Flags().Set("project-id", "proj-1")
	cmd.Flags().Set("local-path", "/tmp/repo")
	cmd.Flags().Set("branch", "feature/test")
	cmd.Flags().Set("source-branch", "main")

	_, err := buildWorkspaceCreateRPCRequest(cmd)
	want := "workspace create only supports worktree workspaces; create a new project to create a primary workspace"
	if err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
}

func TestWorkspaceCreateWatcher_ReplaysBufferedProgressAfterWorkspaceIDKnown(t *testing.T) {
	var out bytes.Buffer
	watcher := newWorkspaceCreateWatcher(&out)

	watcher.handleNotification("events.frontendStream", mustMarshalFrontendEvent(t, "workspaceCreateProgress", workspace.CreateProgressEvent{
		WorkspaceID: "ws-1",
		StepID:      "worktree",
		Status:      workspace.CreateProgressCompleted,
		Message:     "/tmp/repo/.worktrees/feature-test",
	}))
	watcher.handleNotification("events.frontendStream", mustMarshalFrontendEvent(t, "workspaceCreateProgress", workspace.CreateProgressEvent{
		WorkspaceID: "ws-2",
		StepID:      "worktree",
		Status:      workspace.CreateProgressCompleted,
		Message:     "ignored",
	}))

	watcher.setWorkspaceID("ws-1")
	watcher.handleNotification("events.frontendStream", mustMarshalFrontendEvent(t, "workspaceCreateCompleted", workspaceCreateCompletedEvent{
		WorkspaceID:  "ws-1",
		WorktreePath: "/tmp/repo/.worktrees/feature-test",
	}))

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result, err := watcher.wait(ctx)
	if err != nil {
		t.Fatalf("wait: %v", err)
	}
	if result.completed == nil {
		t.Fatal("completed = nil, want completion event")
	}
	if result.completed.WorktreePath != "/tmp/repo/.worktrees/feature-test" {
		t.Fatalf("WorktreePath = %q, want completion path", result.completed.WorktreePath)
	}
	if strings.Contains(out.String(), "ignored") {
		t.Fatalf("output = %q, want ws-2 progress ignored", out.String())
	}
	if !strings.Contains(out.String(), "worktree") || !strings.Contains(out.String(), "completed") {
		t.Fatalf("output = %q, want rendered progress line", out.String())
	}
}

func TestWorkspaceCreateWatcher_ReportsFailure(t *testing.T) {
	watcher := newWorkspaceCreateWatcher(&bytes.Buffer{})
	watcher.setWorkspaceID("ws-1")
	watcher.handleNotification("events.frontendStream", mustMarshalFrontendEvent(t, "workspaceCreateFailed", workspaceCreateFailedEvent{
		WorkspaceID: "ws-1",
		Message:     "branch already exists",
	}))

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result, err := watcher.wait(ctx)
	if err != nil {
		t.Fatalf("wait: %v", err)
	}
	if result.failed == nil {
		t.Fatal("failed = nil, want failure event")
	}
	if result.failed.Message != "branch already exists" {
		t.Fatalf("Message = %q, want %q", result.failed.Message, "branch already exists")
	}
}

func newWorkspaceCreateTestCommand() *cobra.Command {
	cmd := &cobra.Command{Use: "create"}
	addOrgIDFlag(cmd)
	cmd.Flags().String("project-id", "", "")
	cmd.Flags().String("local-path", "", "")
	cmd.Flags().String("kind", string(workspace.KindWorktree), "")
	cmd.Flags().String("branch", "", "")
	cmd.Flags().String("source-branch", "", "")
	cmd.Flags().String("target-node", "", "")
	cmd.Flags().String("name", "", "")
	cmd.Flags().String("task-run-prompt", "", "")
	cmd.Flags().String("task-run-model", "", "")
	return cmd
}

func mustMarshalFrontendEvent(t *testing.T, topic string, payload any) json.RawMessage {
	t.Helper()

	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	encodedEvent, err := json.Marshal(daemonFrontendEvent{Topic: topic, Payload: encodedPayload})
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	return encodedEvent
}

func TestBuildTaskRunConfig(t *testing.T) {
	t.Run("returns nil when prompt is empty", func(t *testing.T) {
		if got := buildTaskRunConfig("", ""); got != nil {
			t.Fatalf("buildTaskRunConfig('', '') = %+v, want nil", got)
		}
	})

	t.Run("returns config with prompt and model", func(t *testing.T) {
		got := buildTaskRunConfig("investigate bug", "gpt-5")
		if got == nil {
			t.Fatal("buildTaskRunConfig returned nil, want non-nil")
		}
		if got.AgentKind != "" {
			t.Fatalf("AgentKind = %q, want empty so the daemon defaults to pi", got.AgentKind)
		}
		if got.Prompt != "investigate bug" || got.Model != "gpt-5" {
			t.Fatalf("TaskRun = %#v, want investigate bug/gpt-5", got)
		}
	})

	t.Run("returns nil when prompt is whitespace only", func(t *testing.T) {
		if got := buildTaskRunConfig("   ", ""); got != nil {
			t.Fatalf("buildTaskRunConfig('   ', '') = %+v, want nil", got)
		}
	})
}

func TestWorkspaceCreateCompletion_Output(t *testing.T) {
	for _, status := range []string{"started", "failed", ""} {
		t.Run("run_"+status, func(t *testing.T) {
			var out bytes.Buffer
			var completed workspaceCreateCompletedEvent
			payload := `{"workspaceId":"ws-1","worktreePath":"/tmp/ws-1","taskRunStatus":"` + status + `","taskRunSessionId":"session-1","taskRunTitle":"Task title"}`
			if err := json.Unmarshal([]byte(payload), &completed); err != nil {
				t.Fatal(err)
			}
			renderWorkspaceCreateCompletion(&out, "ws-1", &completed)
			if !strings.Contains(out.String(), "Created: ws-1  /tmp/ws-1\n") {
				t.Fatalf("output: %s", &out)
			}
			if status == "" {
				if strings.Contains(out.String(), "Task run") {
					t.Fatalf("unexpected run: %s", &out)
				}
			} else {
				for _, line := range []string{"Task run: " + status + "\n", "Task run session: session-1\n", "Task run title: Task title\n"} {
					if !strings.Contains(out.String(), line) {
						t.Errorf("missing %q in %s", line, &out)
					}
				}
			}
		})
	}
}

type workspaceCreateWaitClient struct{ err error }

func (c workspaceCreateWaitClient) CallContext(context.Context, string, any, any) error { return c.err }

func TestWorkspaceCreateWatcher_AcceptedErrorsKeepID(t *testing.T) {
	for _, scenario := range []string{"cancel", "timeout", "connection"} {
		t.Run(scenario, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if scenario == "cancel" {
				cancel()
			}
			if scenario == "timeout" {
				var stop context.CancelFunc
				ctx, stop = context.WithDeadline(ctx, time.Now().Add(-time.Second))
				defer stop()
			}
			watcher := newWorkspaceCreateWatcher(&bytes.Buffer{})
			watcher.setWorkspaceID("ws-known")
			_, err := watcher.waitForCompletion(ctx, workspaceCreateWaitClient{err: io.EOF})
			if err == nil {
				t.Fatal("expected error")
			}
			for _, text := range []string{"ws-known", "accepted", "inspect", "before retrying"} {
				if !strings.Contains(err.Error(), text) {
					t.Errorf("error %q missing %q", err, text)
				}
			}
			if scenario == "connection" && !errors.Is(err, io.EOF) {
				t.Fatalf("lost cause: %v", err)
			}
		})
	}
}

type workspaceCreateFlowClient struct {
	notification func(string, json.RawMessage)
	payload      json.RawMessage
}

func (c *workspaceCreateFlowClient) Call(method string, _ any, out any) error {
	if method == "workspace.create" {
		encoded := []byte(`{"id":"ws-flow","status":"creating"}`)
		if err := json.Unmarshal(encoded, out); err != nil {
			return err
		}
		c.notification("events.frontendStream", c.payload)
	}
	return nil
}
func (c *workspaceCreateFlowClient) CallContext(context.Context, string, any, any) error { return nil }
func (c *workspaceCreateFlowClient) SetNotificationHandler(handler func(string, json.RawMessage)) {
	c.notification = handler
}
func (c *workspaceCreateFlowClient) Close() error { return nil }

func TestWorkspaceCreateCompletion_CommandKeepsCreatedOnRunFailure(t *testing.T) {
	for _, status := range []string{"started", "failed", ""} {
		t.Run("run_"+status, func(t *testing.T) {
			var out bytes.Buffer
			cmd := newWorkspaceCreateTestCommand()
			cmd.SetContext(context.Background())
			cmd.SetOut(&out)
			client := &workspaceCreateFlowClient{payload: mustMarshalFrontendEvent(t, "workspaceCreateCompleted", map[string]string{
				"workspaceId": "ws-flow", "taskRunStatus": status,
			})}
			if err := createWorkspaceWithDaemonClient(cmd, client, workspaceCreateRPCRequest{}); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), "Created: ws-flow\n") {
				t.Fatalf("lost ID: %s", &out)
			}
			if status != "" && !strings.Contains(out.String(), "Task run: "+status+"\n") {
				t.Fatalf("lost status: %s", &out)
			}
			if status == "" && strings.Contains(out.String(), "Task run:") {
				t.Fatalf("unexpected run: %s", &out)
			}
		})
	}
}
