package cmd

import (
	"bytes"
	"context"
	"encoding/json"
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
	cmd.Flags().Set("kind", workspace.KindWorktree)
	cmd.Flags().Set("branch", "feature/test")
	cmd.Flags().Set("source-branch", "main")
	cmd.Flags().Set("name", "feature-test")
	cmd.Flags().Set("target-node", "node-2")
	cmd.Flags().Set("task-run-agent-kind", "claude")
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
	if request.Kind != workspace.KindWorktree {
		t.Fatalf("Kind = %q, want %q", request.Kind, workspace.KindWorktree)
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
	if request.TaskRun.AgentKind != "claude" || request.TaskRun.Prompt != "fix bug" || request.TaskRun.Model != "sonnet" {
		t.Fatalf("TaskRun = %#v, want claude/fix bug/sonnet", request.TaskRun)
	}
}

func TestBuildWorkspaceCreateRPCRequest_PrimaryRequiresLocalPath(t *testing.T) {
	originalConfig := appConfig
	appConfig.DefaultOrgID = "org-default"
	defer func() {
		appConfig = originalConfig
	}()

	cmd := newWorkspaceCreateTestCommand()
	cmd.Flags().Set("project-id", "proj-1")
	cmd.Flags().Set("kind", workspace.KindPrimary)

	_, err := buildWorkspaceCreateRPCRequest(cmd)
	if err == nil || err.Error() != "local-path is required for primary workspaces" {
		t.Fatalf("err = %v, want local-path validation error", err)
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
	cmd.Flags().String("kind", "primary", "")
	cmd.Flags().String("branch", "", "")
	cmd.Flags().String("source-branch", "", "")
	cmd.Flags().String("target-node", "", "")
	cmd.Flags().String("name", "", "")
	cmd.Flags().String("task-run-agent-kind", "", "")
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
