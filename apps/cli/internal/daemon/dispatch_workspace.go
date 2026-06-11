package daemon

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	agentcmd "yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodOpen:
		return h.handleOpen(ctx, params)
	case MethodList:
		return h.manager.List(), nil
	case MethodWorkspaceCreate:
		return h.handleWorkspaceCreate(ctx, params)
	case MethodWorkspaceRefreshPullRequest:
		return h.handleWorkspaceRefreshPullRequest(ctx, params)
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.SyncContextLink(req)
	case MethodWorkspaceSetActive:
		var req workspace.SetActiveWorkspaceRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().SetActiveWorkspace(req)
	case MethodWorkspaceClose:
		return h.handleWorkspaceClose(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown workspace method: "+method)
	}
}

func (h *JSONRPCHandler) handleOpen(_ context.Context, params json.RawMessage) (any, error) {
	var req workspace.OpenRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	ws, err := h.manager.Open(req)
	if err != nil {
		return nil, err
	}
	log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Bool("prAlreadyMerged", req.PRAlreadyMerged).Msg("daemon workspace opened")
	h.watchAndTrack(ws.Path)
	return ws, nil
}

func (h *JSONRPCHandler) handleWorkspaceRefreshPullRequest(_ context.Context, params json.RawMessage) (any, error) {
	var req workspace.RefreshPullRequestRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	workspaceID := strings.TrimSpace(req.WorkspaceID)
	workspacePath := strings.TrimSpace(req.Path)
	if workspaceID == "" && workspacePath == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "workspaceId or path is required")
	}

	ws, err := func() (workspace.Workspace, error) {
		if workspaceID != "" {
			return h.manager.GetWorkspace(workspaceID)
		}
		resolvedWorkspace, ok := h.manager.FindWorkspaceByPath(workspacePath)
		if !ok {
			return workspace.Workspace{}, workspace.NewRPCError(rpcCodeNotFound, "workspace not found")
		}
		return resolvedWorkspace, nil
	}()
	if err != nil {
		return nil, err
	}

	h.prTracker.EnsureTracked(ws.Path, false)
	h.prTracker.RefreshWorkspaceByPath(ws.Path)

	refreshedWorkspace, err := h.manager.GetWorkspace(ws.ID)
	if err != nil {
		return nil, err
	}
	return refreshedWorkspace, nil
}

func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspace.CreateRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	req.ID = generateWorkspaceID()
	if strings.TrimSpace(req.WorkspaceName) == "" {
		req.WorkspaceName = req.ID
	}

	if req.ProjectID != "" {
		_ = createRemoteWorkspace(ctx, h.runtime, WorkspaceCreation{
			ID:             req.ID,
			NodeID:         req.NodeID,
			OrganizationID: req.OrganizationID,
			ProjectID:      req.ProjectID,
			Kind:           workspace.KindWorktree,
			Branch:         req.TargetBranch,
			SourceBranch:   req.SourceBranch,
			LocalPath:      "",
		})
	}

	go h.executeWorkspaceCreate(context.Background(), req)

	return map[string]any{"id": req.ID, "status": "pending"}, nil
}

func (h *JSONRPCHandler) executeWorkspaceCreate(ctx context.Context, req workspace.CreateRequest) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", req.ID).Msg("panic in executeWorkspaceCreate")
		}
	}()

	reportProgress := func(event workspace.CreateProgressEvent) {
		h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
	}

	resolvedCreateRequest, err := resolveCreateRequestForNode(ctx, h.runtime, workspaceCreateRequestInput{
		organizationID: req.OrganizationID,
		projectID:      req.ProjectID,
		localNodeID:    h.nodeID,
		nodeID:         req.NodeID,
		repoKey:        req.RepoKey,
		sourcePath:     req.SourcePath,
	})
	if err != nil {
		reportProgress(workspace.CreateProgressEvent{
			WorkspaceID: req.ID,
			StepID:      "complete",
			Label:       "Prepare workspace",
			Status:      workspace.CreateProgressFailed,
			Message:     err.Error(),
			CreatedAt:   nowRFC3339Nano(),
		})
		return
	}
	req.NodeID = resolvedCreateRequest.nodeID
	req.SourcePath = resolvedCreateRequest.sourcePath

	created, err := h.manager.CreateWorkspaceWithProgress(ctx, req, reportProgress)
	if err != nil {
		reportProgress(workspace.CreateProgressEvent{
			WorkspaceID: req.ID,
			StepID:      "complete",
			Label:       "Prepare workspace",
			Status:      workspace.CreateProgressFailed,
			Message:     err.Error(),
			CreatedAt:   nowRFC3339Nano(),
		})
		return
	}

	h.watchAndTrack(created.Path)
	warnings := buildWorkspaceHookWarnings(req.SetupHook, created.SetupHookResult, h.logFilePath)

	remoteSyncWarning := ""
	if req.ProjectID != "" {
		if err := createRemoteWorkspace(ctx, h.runtime, WorkspaceCreation{
			ID:             created.ID,
			NodeID:         req.NodeID,
			OrganizationID: req.OrganizationID,
			ProjectID:      req.ProjectID,
			Kind:           workspace.KindWorktree,
			Branch:         req.TargetBranch,
			SourceBranch:   req.SourceBranch,
			LocalPath:      created.Path,
		}); err != nil {
			remoteSyncWarning = err.Error()
		}
	}

	reportProgress(workspace.CreateProgressEvent{
		WorkspaceID: created.ID,
		StepID:      "complete",
		Label:       "Prepare workspace",
		Status:      workspace.CreateProgressCompleted,
		CreatedAt:   nowRFC3339Nano(),
	})

	completionPayload := map[string]any{
		"workspaceId":             created.ID,
		"worktreePath":            created.Path,
		"lifecycleScriptWarnings": warnings,
		"remoteSyncWarning":       remoteSyncWarning,
	}

	if req.TaskRun != nil {
		cmd, buildErr := agentcmd.BuildRunCommand(req.TaskRun.AgentKind, req.TaskRun.Prompt, req.TaskRun.Model, true)
		if buildErr != nil {
			log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", req.TaskRun.AgentKind).Msg("task run: failed to build agent command")
		} else {
			resp, startErr := h.manager.Terminals().Start(ctx, created.Path, terminal.StartRequest{
				WorkspaceID: created.ID,
			})
			if startErr != nil {
				log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", req.TaskRun.AgentKind).Msg("task run: failed to start terminal session")
			} else {
				h.manager.Terminals().Send(terminal.SendRequest{
					SessionID: resp.SessionID,
					Input:     shellCommandLine(cmd.Binary, cmd.Args) + "\r",
				})
				completionPayload["taskRunSessionId"] = resp.SessionID
				completionPayload["taskRunAgentKind"] = req.TaskRun.AgentKind
				completionPayload["taskRunPrompt"] = req.TaskRun.Prompt
				log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", req.TaskRun.AgentKind).Str("prompt", req.TaskRun.Prompt).Msg("task run: terminal session started")
			}
		}
	}

	h.events.Publish(frontendEvent{
		Topic:   "workspaceCreateCompleted",
		Payload: completionPayload,
	})
}

func (h *JSONRPCHandler) handleWorkspaceClose(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ProjectID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "projectId is required")
	}
	if h.tokenUsage != nil {
		h.tokenUsage.SyncNow("close")
	}
	if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
		WorkspaceID:    req.WorkspaceID,
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
	}); err != nil {
		return nil, err
	}

	closeReq := workspace.CloseRequest{
		WorkspaceID:   req.WorkspaceID,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	}
	ws, wsErr := h.manager.GetWorkspace(closeReq.WorkspaceID)
	if wsErr == nil && h.cleanupStore != nil {
		if err := h.cleanupStore.Add(pendingWorkspaceCleanup{
			WorkspaceID:   closeReq.WorkspaceID,
			Path:          ws.Path,
			Branch:        closeReq.Branch,
			RemoveBranch:  closeReq.RemoveBranch,
			ForceWorktree: closeReq.ForceWorktree,
			ForceBranch:   closeReq.ForceBranch,
			PostHook:      closeReq.PostHook,
		}); err != nil {
			return nil, err
		}
	}
	if wsErr == nil {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(ws.ID)
	}
	if _, err := h.manager.CloseWorkspace(ctx, closeReq); err != nil {
		if h.cleanupStore != nil {
			if markErr := h.cleanupStore.MarkFailure(closeReq.WorkspaceID, err); markErr != nil {
				log.Warn().Err(markErr).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to mark workspace cleanup failure")
			}
		}
		return nil, err
	}
	if h.cleanupStore != nil {
		if err := h.cleanupStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove completed workspace cleanup")
		}
	}

	return map[string]any{
		"workspace":   map[string]string{"id": req.WorkspaceID, "status": "closed"},
		"workspaceId": req.WorkspaceID,
	}, nil
}

// watchAndTrack starts filesystem watching and PR tracking for a workspace path.
func (h *JSONRPCHandler) watchAndTrack(path string) {
	h.watchers.Watch(path)
	h.prTracker.EnsureTracked(path, true)
}

// buildWorkspaceHookWarnings builds the lifecycle script warning list from a HookResult.
// Returns a non-nil empty slice when the hook result is nil or has no error.
func buildWorkspaceHookWarnings(command string, result *workspace.HookResult, logFilePath string) []any {
	warnings := []any{}
	if result != nil && result.Error != "" {
		warnings = append(warnings, hookResultToWarning("setup", command, result, logFilePath))
	}
	return warnings
}

// hookResultToWarning converts a HookResult into the structured warning shape
// that the desktop UI expects for lifecycle script warnings.
func hookResultToWarning(scriptKind string, command string, hr *workspace.HookResult, logFilePath string) map[string]any {
	var exitCode any
	if hr.ExitCode >= 0 {
		exitCode = hr.ExitCode
	}

	timedOut := false
	if hr.Error != "" {
		timedOut = strings.Contains(hr.Error, "timed out")
	}

	var logFileValue any
	if logFilePath != "" {
		logFileValue = logFilePath
	}

	return map[string]any{
		"scriptKind":    scriptKind,
		"timedOut":      timedOut,
		"message":       hr.Error,
		"command":       command,
		"stdoutExcerpt": hr.Stdout,
		"stderrExcerpt": hr.Stderr,
		"exitCode":      exitCode,
		"signal":        nil,
		"logFilePath":   logFileValue,
	}
}

func generateWorkspaceID() string {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
			uint32(time.Now().UnixNano()),
			uint16(time.Now().UnixNano()>>16),
			0x4000,
			0x8000,
			uint64(time.Now().UnixNano()))
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
}

func shellCommandLine(binary string, args []string) string {
	var b strings.Builder
	b.WriteString(binary)
	for _, arg := range args {
		b.WriteByte(' ')
		if strings.ContainsAny(arg, " \t\n\r'\"") {
			b.WriteByte('\'')
			b.WriteString(strings.ReplaceAll(arg, "'", "'\\''"))
			b.WriteByte('\'')
		} else {
			b.WriteString(arg)
		}
	}
	return b.String()
}
