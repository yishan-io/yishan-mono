package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"

	"github.com/spf13/cobra"
)

type persistentDaemonRPCClient interface {
	Call(method string, params any, out any) error
	CallContext(context.Context, string, any, any) error
	SetNotificationHandler(handler func(method string, params json.RawMessage))
	Close() error
}

type workspaceCreateRPCRequest struct {
	OrganizationID string                   `json:"organizationId"`
	ProjectID      string                   `json:"projectId"`
	NodeID         string                   `json:"nodeId,omitempty"`
	Kind           string                   `json:"kind,omitempty"`
	Branch         string                   `json:"branch,omitempty"`
	SourceBranch   string                   `json:"sourceBranch,omitempty"`
	WorkspaceName  string                   `json:"workspaceName,omitempty"`
	TaskRun        *workspace.TaskRunConfig `json:"taskRun,omitempty"`
}

type workspaceCreateAccepted struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

type workspaceCreateCompletedEvent struct {
	WorkspaceID             string `json:"workspaceId"`
	WorktreePath            string `json:"worktreePath"`
	LifecycleScriptWarnings []any  `json:"lifecycleScriptWarnings,omitempty"`
	TaskRunStatus           string `json:"taskRunStatus,omitempty"`
	TaskRunSessionID        string `json:"taskRunSessionId,omitempty"`
	TaskRunTitle            string `json:"taskRunTitle,omitempty"`
}

type workspaceCreateFailedEvent struct {
	WorkspaceID string `json:"workspaceId"`
	Message     string `json:"message"`
}

type daemonFrontendEvent struct {
	Topic   string          `json:"topic"`
	Payload json.RawMessage `json:"payload"`
}

type workspaceCreateWaitResult struct {
	completed *workspaceCreateCompletedEvent
	failed    *workspaceCreateFailedEvent
	err       error
}

var newPersistentDaemonRPCClient = func(ctx context.Context, wsURL string) (persistentDaemonRPCClient, error) {
	return daemonclient.NewPersistent(ctx, wsURL, "")
}

func runWorkspaceCreateViaDaemon(cmd *cobra.Command) error {
	request, err := buildWorkspaceCreateRPCRequest(cmd)
	if err != nil {
		return err
	}

	client, err := resolvePersistentDaemonRPCClient(cmd.Context())
	if err != nil {
		return err
	}
	defer client.Close()

	return createWorkspaceWithDaemonClient(cmd, client, request)
}

func createWorkspaceWithDaemonClient(cmd *cobra.Command, client persistentDaemonRPCClient, request workspaceCreateRPCRequest) error {
	watcher := newWorkspaceCreateWatcher(cmd.OutOrStdout())
	client.SetNotificationHandler(watcher.handleNotification)
	defer client.SetNotificationHandler(nil)

	if err := client.Call(rpc.MethodFrontendEventsStream, nil, nil); err != nil {
		return fmt.Errorf("subscribe to daemon event stream: %w", err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), "Creating workspace...")

	var accepted workspaceCreateAccepted
	if err := client.Call(rpc.MethodWorkspaceCreate, request, &accepted); err != nil {
		return err
	}
	if strings.TrimSpace(accepted.ID) == "" {
		return fmt.Errorf("daemon did not return a workspace id")
	}

	watcher.setWorkspaceID(accepted.ID)

	result, err := watcher.waitForCompletion(cmd.Context(), client)
	if err != nil {
		return err
	}
	if result.failed != nil {
		return fmt.Errorf("workspace %s creation failed: %s; inspect workspace and run state before retrying", accepted.ID, strings.TrimSpace(result.failed.Message))
	}
	if result.completed == nil {
		return fmt.Errorf("workspace %s was accepted but finished without a completion event; inspect workspace and run state before retrying", accepted.ID)
	}

	renderWorkspaceCreateCompletion(cmd.OutOrStdout(), accepted.ID, result.completed)

	return nil
}

func buildWorkspaceCreateRPCRequest(cmd *cobra.Command) (workspaceCreateRPCRequest, error) {
	orgID, err := resolveOrgID(cmd)
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	projectID, err := cmd.Flags().GetString("project-id")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	localPath, err := cmd.Flags().GetString("local-path")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	kind, err := cmd.Flags().GetString("kind")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	branch, err := cmd.Flags().GetString("branch")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	sourceBranch, err := cmd.Flags().GetString("source-branch")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	name, err := cmd.Flags().GetString("name")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	targetNode, err := cmd.Flags().GetString("target-node")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	taskRunPrompt, err := cmd.Flags().GetString("task-run-prompt")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	taskRunModel, err := cmd.Flags().GetString("task-run-model")
	if err != nil {
		return workspaceCreateRPCRequest{}, err
	}

	if strings.TrimSpace(localPath) != "" {
		return workspaceCreateRPCRequest{}, fmt.Errorf("workspace create only supports worktree workspaces; create a new project to create a primary workspace")
	}
	if err := validateWorkspaceKind(kind); err != nil {
		return workspaceCreateRPCRequest{}, err
	}
	if strings.TrimSpace(branch) == "" {
		return workspaceCreateRPCRequest{}, fmt.Errorf("branch is required for worktree workspaces")
	}
	if strings.TrimSpace(sourceBranch) == "" {
		return workspaceCreateRPCRequest{}, fmt.Errorf("source-branch is required for worktree workspaces")
	}

	return workspaceCreateRPCRequest{
		OrganizationID: orgID,
		ProjectID:      projectID,
		NodeID:         strings.TrimSpace(targetNode),
		Kind:           strings.TrimSpace(kind),
		Branch:         strings.TrimSpace(branch),
		SourceBranch:   strings.TrimSpace(sourceBranch),
		WorkspaceName:  strings.TrimSpace(name),
		TaskRun:        buildTaskRunConfig(taskRunPrompt, taskRunModel),
	}, nil
}

func resolvePersistentDaemonRPCClient(ctx context.Context) (persistentDaemonRPCClient, error) {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return nil, fmt.Errorf("resolve daemon state: %w", err)
	}

	state, err := daemon.LoadState(statePath)
	if err != nil {
		return nil, fmt.Errorf("daemon not running: %w\n\nStart the daemon with: yishan daemon start", err)
	}
	if !daemon.IsProcessRunning(state.PID) {
		return nil, fmt.Errorf("daemon process not running (pid %d)\n\nRestart the daemon with: yishan daemon restart", state.PID)
	}
	if !daemon.ProbeHealth(state, 250*time.Millisecond) {
		return nil, fmt.Errorf("daemon is not responding on %s:%d\n\nRestart the daemon with: yishan daemon restart", state.Host, state.Port)
	}

	wsURL := "ws://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/ws"
	client, err := newPersistentDaemonRPCClient(ctx, wsURL)
	if err != nil {
		return nil, fmt.Errorf("connect to daemon at %s: %w", wsURL, err)
	}
	return client, nil
}

type workspaceCreateWatcher struct {
	mu          sync.Mutex
	workspaceID string
	backlog     []daemonFrontendEvent
	out         io.Writer
	resultCh    chan workspaceCreateWaitResult
}

func newWorkspaceCreateWatcher(out io.Writer) *workspaceCreateWatcher {
	return &workspaceCreateWatcher{
		out:      out,
		resultCh: make(chan workspaceCreateWaitResult, 1),
	}
}

func (w *workspaceCreateWatcher) setWorkspaceID(workspaceID string) {
	w.mu.Lock()
	w.workspaceID = strings.TrimSpace(workspaceID)
	backlog := append([]daemonFrontendEvent(nil), w.backlog...)
	w.backlog = nil
	targetWorkspaceID := w.workspaceID
	w.mu.Unlock()

	for _, event := range backlog {
		w.processEvent(targetWorkspaceID, event)
	}
}

func (w *workspaceCreateWatcher) handleNotification(method string, params json.RawMessage) {
	if method != rpc.MethodFrontendEventsStream {
		return
	}

	var event daemonFrontendEvent
	if err := json.Unmarshal(params, &event); err != nil {
		return
	}

	w.mu.Lock()
	targetWorkspaceID := w.workspaceID
	if targetWorkspaceID == "" {
		w.backlog = append(w.backlog, event)
		w.mu.Unlock()
		return
	}
	w.mu.Unlock()

	w.processEvent(targetWorkspaceID, event)
}

func (w *workspaceCreateWatcher) wait(ctx context.Context) (workspaceCreateWaitResult, error) {
	select {
	case <-ctx.Done():
		return workspaceCreateWaitResult{}, ctx.Err()
	case result := <-w.resultCh:
		return result, result.err
	}
}

func (w *workspaceCreateWatcher) processEvent(workspaceID string, event daemonFrontendEvent) {
	switch event.Topic {
	case "workspaceCreateProgress":
		var progress workspace.CreateProgressEvent
		if err := json.Unmarshal(event.Payload, &progress); err != nil {
			return
		}
		if strings.TrimSpace(progress.WorkspaceID) != workspaceID {
			return
		}
		fmt.Fprintln(w.out, renderWorkspaceCreateProgress(progress))
	case "workspaceCreateCompleted":
		var completed workspaceCreateCompletedEvent
		if err := json.Unmarshal(event.Payload, &completed); err != nil {
			return
		}
		if strings.TrimSpace(completed.WorkspaceID) != workspaceID {
			return
		}
		w.publishResult(workspaceCreateWaitResult{completed: &completed})
	case "workspaceCreateFailed":
		var failed workspaceCreateFailedEvent
		if err := json.Unmarshal(event.Payload, &failed); err != nil {
			return
		}
		if strings.TrimSpace(failed.WorkspaceID) != workspaceID {
			return
		}
		w.publishResult(workspaceCreateWaitResult{failed: &failed})
	}
}

func (w *workspaceCreateWatcher) publishResult(result workspaceCreateWaitResult) {
	select {
	case w.resultCh <- result:
	default:
	}
}

func renderWorkspaceCreateProgress(event workspace.CreateProgressEvent) string {
	stepID := strings.TrimSpace(event.StepID)
	if stepID == "complete" {
		stepID = "workspace"
	}

	status := strings.TrimSpace(string(event.Status))
	message := strings.TrimSpace(event.Message)
	line := fmt.Sprintf("  %-10s %s", stepID, status)
	if message != "" {
		line += "  " + message
	}
	return line
}

func renderWorkspaceCreateCompletion(out io.Writer, workspaceID string, completed *workspaceCreateCompletedEvent) {
	fmt.Fprintf(out, "\nCreated: %s", workspaceID)
	if path := strings.TrimSpace(completed.WorktreePath); path != "" {
		fmt.Fprintf(out, "  %s", path)
	}
	fmt.Fprintln(out)
	if status := strings.TrimSpace(completed.TaskRunStatus); status != "" {
		fmt.Fprintln(out, "Task run:", status)
		if sessionID := strings.TrimSpace(completed.TaskRunSessionID); sessionID != "" {
			fmt.Fprintln(out, "Task run session:", sessionID)
		}
		if title := strings.TrimSpace(completed.TaskRunTitle); title != "" {
			fmt.Fprintln(out, "Task run title:", strings.Join(strings.Fields(title), " "))
		}
	}
}

func (w *workspaceCreateWatcher) waitForCompletion(ctx context.Context, client interface {
	CallContext(context.Context, string, any, any) error
}) (workspaceCreateWaitResult, error) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		var err error
		select {
		case <-ctx.Done():
			err = ctx.Err()
		case result := <-w.resultCh:
			if result.err == nil {
				return result, nil
			}
			err = result.err
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = client.CallContext(pingCtx, rpc.MethodDaemonPing, nil, nil)
			cancel()
		}
		if err != nil {
			return workspaceCreateWaitResult{}, fmt.Errorf("workspace %s was accepted; completion is unknown: %w; inspect workspace and run state before retrying", w.workspaceID, err)
		}
	}
}
