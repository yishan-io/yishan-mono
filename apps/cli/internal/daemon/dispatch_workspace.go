package daemon

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	agentcmd "yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodList:
		return h.manager.List(), nil
	case MethodWorkspaceOpen:
		return h.handleWorkspaceOpen(params)
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
	case MethodWorkspaceHealth:
		return h.handleWorkspaceHealth(ctx, params)
	case MethodWorkspaceRepair:
		return h.handleWorkspaceRepair(ctx, params)
	case MethodWorkspaceForget:
		return h.handleWorkspaceForget(ctx, params)
	case MethodWorkspaceOpenProject:
		return h.handleWorkspaceOpenProject(ctx, params)
	case MethodWorkspaceCloseProject:
		return h.handleWorkspaceCloseProject(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown workspace method: "+method)
	}
}

func (h *JSONRPCHandler) handleWorkspaceOpen(params json.RawMessage) (any, error) {
	var req workspace.OpenRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	openedWorkspace, err := h.manager.Open(req)
	if err != nil {
		return nil, err
	}

	if req.Ephemeral {
		return openedWorkspace, nil
	}

	h.watchAndTrack(openedWorkspace.ID, openedWorkspace.Path)
	if h.wsIndexStore != nil {
		if upsertErr := h.wsIndexStore.Upsert(workspaceIndexEntry{
			WorkspaceID:  openedWorkspace.ID,
			WorktreePath: openedWorkspace.Path,
			ProjectID:    openedWorkspace.ProjectID,
			OrgID:        openedWorkspace.OrgID,
			State:        openedWorkspace.State,
		}); upsertErr != nil {
			log.Warn().Err(upsertErr).Str("workspaceId", openedWorkspace.ID).Msg("workspace index store upsert failed on open")
		}
	}

	return openedWorkspace, nil
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
	var req workspaceCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	prepared, err := h.prepareWorkspaceCreate(ctx, req)
	if err != nil {
		return nil, err
	}
	prepared, err = h.registerPreparedWorkspace(ctx, prepared, "")
	if err != nil {
		return nil, err
	}
	h.events.Publish(frontendEvent{Topic: "workspaceCreateStarted", Payload: prepared.startedEvent})

	go h.executeWorkspaceCreate(context.Background(), prepared)

	return map[string]any{"id": prepared.workspaceID, "status": "pending"}, nil
}

func (h *JSONRPCHandler) executeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", prepared.workspaceID).Msg("panic in executeWorkspaceCreate")
		}
	}()

	reportProgress := func(event workspace.CreateProgressEvent) {
		h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
		h.relayWorkspaceCreateProgress(prepared, event)
	}

	reportFailed := func(message string) {
		failedEvent := workspaceCreateFailedEvent{WorkspaceID: prepared.workspaceID, Message: message}
		reportProgress(workspace.CreateProgressEvent{
			WorkspaceID: prepared.workspaceID,
			StepID:      "complete",
			Label:       "Prepare workspace",
			Status:      workspace.CreateProgressFailed,
			Message:     message,
			CreatedAt:   nowRFC3339Nano(),
		})
		h.events.Publish(frontendEvent{
			Topic:   "workspaceCreateFailed",
			Payload: failedEvent,
		})
		h.relayWorkspaceCreateFailed(prepared, failedEvent)
	}

	if prepared.remoteRequest != nil {
		if err := h.dispatchRemoteWorkspaceCreate(*prepared.remoteRequest); err != nil {
			h.rollbackWorkspaceCreateRegistration(ctx, prepared)
			reportFailed(err.Error())
		}
		return
	}
	if prepared.localCreate != nil {
		if err := h.executeWorktreeWorkspaceCreate(ctx, prepared, reportProgress); err != nil {
			reportFailed(err.Error())
		}
	}
}

func (h *JSONRPCHandler) executeWorktreeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate, reportProgress workspace.CreateProgressReporter) error {
	created, err := h.manager.CreateWorkspaceWithProgress(ctx, *prepared.localCreate, reportProgress)
	if err != nil {
		h.rollbackWorkspaceCreateRegistration(ctx, prepared)
		return err
	}
	h.watchAndTrack(created.ID, created.Path)
	h.upsertWorkspaceIndex(created)
	if err := h.updatePreparedWorkspace(ctx, prepared, created.Path); err != nil {
		h.rollbackWorkspaceCreateFailure(ctx, prepared, created)
		return err
	}
	warnings := buildWorkspaceHookWarnings(prepared.localCreate.SetupHook, created.SetupHookResult, h.logFilePath)
	reportProgress(workspace.CreateProgressEvent{WorkspaceID: created.ID, StepID: "complete", Label: "Prepare workspace", Status: workspace.CreateProgressCompleted, CreatedAt: nowRFC3339Nano()})
	h.publishWorkspaceCreateCompleted(prepared, created, warnings)
	return nil
}

func applyAuthoritativeWorkspaceID(prepared preparedWorkspaceCreate, workspaceID string) preparedWorkspaceCreate {
	normalizedWorkspaceID := strings.TrimSpace(workspaceID)
	if normalizedWorkspaceID == "" {
		return prepared
	}
	prepared.workspaceID = normalizedWorkspaceID
	prepared.startedEvent.WorkspaceID = normalizedWorkspaceID
	if prepared.registration != nil {
		prepared.registration.ID = normalizedWorkspaceID
	}
	if prepared.localCreate != nil {
		prepared.localCreate.ID = normalizedWorkspaceID
	}
	if prepared.remoteRequest != nil {
		prepared.remoteRequest.ID = normalizedWorkspaceID
	}
	return prepared
}

func (h *JSONRPCHandler) registerPreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) (preparedWorkspaceCreate, error) {
	if prepared.registration == nil {
		return prepared, nil
	}
	registration := *prepared.registration
	registration.LocalPath = localPath
	registeredWorkspace, err := registerWorkspace(ctx, h.runtime, registration)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	prepared = applyAuthoritativeWorkspaceID(prepared, registeredWorkspace.ID)
	if strings.TrimSpace(registeredWorkspace.ID) != "" {
		h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.workspaceID, "created")
	}
	return prepared, nil
}

func (h *JSONRPCHandler) updatePreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) error {
	if prepared.registration == nil {
		return nil
	}
	if err := updateWorkspace(ctx, h.runtime, *prepared.registration, localPath); err != nil {
		return err
	}
	h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.registration.ID, "updated")
	return nil
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if prepared.registration == nil {
		return
	}
	if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
		WorkspaceID:    prepared.registration.ID,
		SourceNodeID:   prepared.registration.SourceNodeID,
		OrganizationID: prepared.organizationID,
		ProjectID:      prepared.projectID,
	}); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create registration")
	}
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateFailure(
	ctx context.Context,
	prepared preparedWorkspaceCreate,
	created workspace.Workspace,
) {
	if prepared.registration != nil {
		if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
			WorkspaceID:    prepared.registration.ID,
			SourceNodeID:   prepared.registration.SourceNodeID,
			OrganizationID: prepared.organizationID,
			ProjectID:      prepared.projectID,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create rollback")
		}
	}

	closeReq := workspace.ClosePathRequest{
		WorkspaceID:   created.ID,
		Path:          created.Path,
		Branch:        prepared.localCreate.TargetBranch,
		RemoveBranch:  true,
		ForceWorktree: true,
		ForceBranch:   true,
	}
	h.cleanupLocalWorkspaceCreateFailure(ctx, closeReq)
}

func (h *JSONRPCHandler) cleanupLocalWorkspaceCreateFailure(ctx context.Context, closeReq workspace.ClosePathRequest) {
	if strings.TrimSpace(closeReq.Path) == "" {
		return
	}

	h.watchers.Unwatch(closeReq.Path)
	h.prTracker.StopTracking(closeReq.WorkspaceID)

	if h.cleanupStore != nil {
		if err := h.cleanupStore.Add(pendingWorkspaceCleanup{
			WorkspaceID:   closeReq.WorkspaceID,
			Path:          closeReq.Path,
			Branch:        closeReq.Branch,
			RemoveBranch:  closeReq.RemoveBranch,
			ForceWorktree: closeReq.ForceWorktree,
			ForceBranch:   closeReq.ForceBranch,
			PostHook:      closeReq.PostHook,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to register workspace create rollback cleanup")
		}
	}

	if _, err := h.manager.CloseWorkspacePath(ctx, closeReq); err != nil {
		if h.cleanupStore != nil {
			if markErr := h.cleanupStore.MarkFailure(closeReq.WorkspaceID, err); markErr != nil {
				log.Warn().Err(markErr).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to mark workspace create rollback cleanup failure")
			}
		}
		log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Str("path", closeReq.Path).Msg("workspace create rollback cleanup failed")
	} else if h.cleanupStore != nil {
		if err := h.cleanupStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove completed workspace create rollback cleanup")
		}
	}

	h.manager.RemoveWorkspaceFromMemory(closeReq.WorkspaceID)
	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove rolled back workspace from index store")
		}
	}
	h.clearAgentUsage(closeReq.WorkspaceID)
}

func (h *JSONRPCHandler) publishWorkspaceSnapshotChanged(
	organizationID string,
	projectID string,
	workspaceID string,
	change string,
) {
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" || strings.TrimSpace(workspaceID) == "" {
		return
	}

	h.events.Publish(frontendEvent{Topic: "workspaceSnapshotChanged", Payload: map[string]any{
		"organizationId": organizationID,
		"resource":       "workspace",
		"change":         change,
		"projectId":      projectID,
		"workspaceId":    workspaceID,
	}})
}

func (h *JSONRPCHandler) upsertWorkspaceIndex(created workspace.Workspace) {
	if h.wsIndexStore == nil || created.Path == "" {
		return
	}
	if err := h.wsIndexStore.Upsert(workspaceIndexEntry{WorkspaceID: created.ID, WorktreePath: created.Path, ProjectID: created.ProjectID, OrgID: created.OrgID, State: created.State}); err != nil {
		log.Warn().Err(err).Str("workspaceId", created.ID).Msg("workspace index store upsert failed on create")
	}
}

func (h *JSONRPCHandler) publishWorkspaceCreateCompleted(prepared preparedWorkspaceCreate, created workspace.Workspace, warnings []any) {
	completionPayload := map[string]any{"workspaceId": created.ID, "worktreePath": created.Path, "lifecycleScriptWarnings": warnings}
	h.maybeStartTaskRun(context.Background(), prepared, created, completionPayload)
	h.events.Publish(frontendEvent{Topic: "workspaceCreateCompleted", Payload: completionPayload})
	h.relayWorkspaceCreateCompleted(prepared, completionPayload)
}

func (h *JSONRPCHandler) maybeStartTaskRun(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace, completionPayload map[string]any) {
	if prepared.localCreate == nil || prepared.localCreate.TaskRun == nil {
		return
	}
	cmd, buildErr := agentcmd.BuildRunCommand(prepared.localCreate.TaskRun.AgentKind, prepared.localCreate.TaskRun.Prompt, prepared.localCreate.TaskRun.Model, true)
	if buildErr != nil {
		log.Warn().Err(buildErr).Str("workspaceId", created.ID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Msg("task run: failed to build agent command")
		return
	}
	resp, startErr := h.manager.Terminals().Start(ctx, created.Path, terminal.StartRequest{WorkspaceID: created.ID, TabID: "task-" + created.ID, PaneID: "pane-task-" + created.ID})
	if startErr != nil {
		log.Warn().Err(startErr).Str("workspaceId", created.ID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Msg("task run: failed to start terminal session")
		return
	}
	h.manager.Terminals().Send(terminal.SendRequest{SessionID: resp.SessionID, Input: shellCommandLine(cmd.Binary, cmd.Args) + "\r"})
	completionPayload["taskRunSessionId"] = resp.SessionID
	completionPayload["taskRunAgentKind"] = prepared.localCreate.TaskRun.AgentKind
	completionPayload["taskRunPrompt"] = prepared.localCreate.TaskRun.Prompt
	completionPayload["taskRunTabId"] = "task-" + created.ID
	completionPayload["taskRunPaneId"] = "pane-task-" + created.ID
	log.Info().Str("workspaceId", created.ID).Str("sessionId", resp.SessionID).Str("agentKind", prepared.localCreate.TaskRun.AgentKind).Str("prompt", prepared.localCreate.TaskRun.Prompt).Msg("task run: terminal session started")
}

func (h *JSONRPCHandler) handleWorkspaceClose(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ProjectID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "projectId is required")
	}

	h.manager.SetWorkspaceState(req.WorkspaceID, workspace.WorkspaceStateClosing, "")

	if h.tokenUsage != nil {
		h.tokenUsage.SyncNow("close")
	}
	if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
		WorkspaceID:    req.WorkspaceID,
		SourceNodeID:   h.nodeID,
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
	h.summarizeUsedAgents(req.WorkspaceID, closeReq)
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
	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace from index store")
		}
	}
	h.clearAgentUsage(req.WorkspaceID)

	return map[string]any{
		"workspace":   map[string]string{"id": req.WorkspaceID, "status": "closed"},
		"workspaceId": req.WorkspaceID,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceHealth(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceHealthParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.manager.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	state := workspace.WorkspaceStateActive
	health := ""
	healthErr := ""

	if _, statErr := os.Stat(ws.Path); statErr != nil {
		state = workspace.WorkspaceStateDegraded
		health = workspace.WorkspaceHealthPathMissing
		healthErr = statErr.Error()
	}

	if healthErr == "" {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr != nil {
			state = workspace.WorkspaceStateDegraded
			health = workspace.WorkspaceHealthPathMissing
			healthErr = checkErr.Error()
		} else if !isWorktree {
			state = workspace.WorkspaceStateDegraded
			health = workspace.WorkspaceHealthNotWorktree
		}
	}

	if err := h.manager.SetWorkspaceState(req.WorkspaceID, state, health); err != nil {
		return nil, err
	}

	if state == workspace.WorkspaceStateDegraded {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(req.WorkspaceID)
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Upsert(workspaceIndexEntry{
			WorkspaceID:  ws.ID,
			WorktreePath: ws.Path,
			ProjectID:    ws.ProjectID,
			OrgID:        ws.OrgID,
			State:        state,
			Health:       health,
			LastSeen:     time.Now().UTC().Format(time.RFC3339),
			Error:        healthErr,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("workspace index store upsert failed during health check")
		}
	}

	h.emitWorkspaceStateChanged(req.WorkspaceID, state, health, false)

	return workspaceHealthResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Path:        ws.Path,
		Error:       healthErr,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceRepair(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceRepairParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, err := h.manager.GetWorkspace(req.WorkspaceID)
	if err != nil {
		return nil, err
	}

	if ws.State != workspace.WorkspaceStateDegraded {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "workspace is not in degraded state")
	}

	repaired := false
	state := ws.State
	health := ws.Health
	repairErr := ""

	if ws.Health == workspace.WorkspaceHealthPathMissing {
		if _, statErr := os.Stat(ws.Path); statErr == nil {
			repaired = true
		} else {
			repairErr = statErr.Error()
		}
	} else if ws.Health == workspace.WorkspaceHealthNotWorktree {
		isWorktree, checkErr := isGitWorktree(ws.Path)
		if checkErr == nil && isWorktree {
			repaired = true
		} else if checkErr != nil {
			repairErr = checkErr.Error()
		}
	} else {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "unknown health condition: "+ws.Health)
	}

	if repaired {
		state = workspace.WorkspaceStateActive
		health = ""
		h.watchAndTrack(ws.ID, ws.Path)
	}

	if err := h.manager.SetWorkspaceState(req.WorkspaceID, state, health); err != nil {
		return nil, err
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Upsert(workspaceIndexEntry{
			WorkspaceID:  ws.ID,
			WorktreePath: ws.Path,
			ProjectID:    ws.ProjectID,
			OrgID:        ws.OrgID,
			State:        state,
			Health:       health,
			LastSeen:     time.Now().UTC().Format(time.RFC3339),
			Error:        repairErr,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("workspace index store upsert failed during repair")
		}
	}

	h.emitWorkspaceStateChanged(req.WorkspaceID, state, health, false)

	return workspaceRepairResult{
		WorkspaceID: req.WorkspaceID,
		State:       state,
		Health:      health,
		Error:       repairErr,
	}, nil
}

func (h *JSONRPCHandler) handleWorkspaceForget(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceForgetParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	ws, wsErr := h.manager.GetWorkspace(req.WorkspaceID)
	if wsErr == nil {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(ws.ID)
		h.manager.RemoveWorkspaceFromMemory(req.WorkspaceID)
	}

	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Remove(req.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", req.WorkspaceID).Msg("failed to remove workspace from index store during forget")
		}
	}

	if wsErr == nil {
		h.emitWorkspaceStateChanged(req.WorkspaceID, "", "", true)
	}

	return workspaceForgetResult{
		WorkspaceID: req.WorkspaceID,
		Removed:     true,
	}, nil
}

func (h *JSONRPCHandler) emitWorkspaceStateChanged(workspaceID string, state string, health string, removed bool) {
	h.events.Publish(frontendEvent{
		Topic: "workspaceStateChanged",
		Payload: map[string]any{
			"workspaceId": workspaceID,
			"state":       state,
			"health":      health,
			"removed":     removed,
		},
	})
}

func isGitWorktree(path string) (bool, error) {
	gitDir := filepath.Join(path, ".git")
	info, err := os.Stat(gitDir)
	if err != nil {
		return false, err
	}
	if info.IsDir() {
		return true, nil
	}
	return false, nil
}

func (h *JSONRPCHandler) summarizeUsedAgents(workspaceID string, closeReq workspace.CloseRequest) {
	if h.memory == nil {
		return
	}
	agents := h.getAgentUsage(workspaceID)
	if len(agents) == 0 {
		return
	}
	ws, err := h.manager.GetWorkspace(workspaceID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("cannot resolve workspace for agent summarization")
		return
	}
	log.Info().Strs("agents", agents).Str("workspaceId", workspaceID).Msg("summarizing agents used in workspace")
	for _, agent := range agents {
		h.memory.SummarizeSession(agent, ws.Path, ws.ProjectID)
	}
}

// watchAndTrack starts filesystem watching and PR tracking for a workspace path.
func (h *JSONRPCHandler) watchAndTrack(workspaceID string, path string) {
	h.watchers.Watch(workspaceID, path)
	h.prTracker.EnsureTracked(path, true)
}

func normalizeWorkspaceOpenProjectPath(path string) string {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return ""
	}
	absolutePath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return filepath.Clean(trimmedPath)
	}
	resolvedPath, err := filepath.EvalSymlinks(absolutePath)
	if err == nil {
		return resolvedPath
	}
	return filepath.Clean(absolutePath)
}

func shouldSkipWorkspaceOpenProject(existing workspace.Workspace, entry workspaceOpenProjectEntry) bool {
	return normalizeWorkspaceOpenProjectPath(existing.Path) == normalizeWorkspaceOpenProjectPath(entry.WorktreePath) &&
		strings.TrimSpace(existing.ProjectID) == strings.TrimSpace(entry.ProjectID) &&
		strings.TrimSpace(existing.OrgID) == strings.TrimSpace(entry.OrgID)
}

func (h *JSONRPCHandler) upsertActiveWorkspaceIndexEntry(ws workspace.Workspace) {
	if h.wsIndexStore == nil {
		return
	}
	if err := h.wsIndexStore.Upsert(workspaceIndexEntry{
		WorkspaceID:  ws.ID,
		WorktreePath: ws.Path,
		ProjectID:    ws.ProjectID,
		OrgID:        ws.OrgID,
		State:        workspace.WorkspaceStateActive,
		LastSeen:     time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		log.Warn().Err(err).Str("workspaceId", ws.ID).Msg("workspace.openProject: index upsert failed")
	}
}

func (h *JSONRPCHandler) openProjectWorkspace(entry workspaceOpenProjectEntry) (string, bool, error) {
	workspaceID := strings.TrimSpace(entry.WorkspaceID)
	workspacePath := strings.TrimSpace(entry.WorktreePath)
	if workspaceID == "" || workspacePath == "" {
		return "", false, fmt.Errorf("missing workspaceId or worktreePath")
	}
	if existingWorkspace, err := h.manager.GetWorkspace(workspaceID); err == nil {
		if shouldSkipWorkspaceOpenProject(existingWorkspace, entry) {
			return workspaceID, false, nil
		}
	}
	openedWorkspace, err := h.manager.Open(workspace.OpenRequest{
		ID:        workspaceID,
		Path:      workspacePath,
		ProjectID: entry.ProjectID,
		OrgID:     entry.OrgID,
	})
	if err != nil {
		return workspaceID, false, err
	}
	h.upsertActiveWorkspaceIndexEntry(openedWorkspace)
	h.watchAndTrack(openedWorkspace.ID, openedWorkspace.Path)
	return openedWorkspace.ID, true, nil
}

// handleWorkspaceOpenProject opens one or more workspaces on the daemon side,
// writes each to workspace-index.json, and starts file watching + PR tracking.
// Already-open workspaces are skipped only when path/project/org already match.
func (h *JSONRPCHandler) handleWorkspaceOpenProject(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceOpenProjectParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	opened, skipped, openErrors := []string{}, []string{}, []string{}
	for _, entry := range req.Workspaces {
		workspaceID, didOpenWorkspace, err := h.openProjectWorkspace(entry)
		if err != nil {
			if workspaceID != "" {
				log.Warn().Err(err).Str("workspaceId", workspaceID).Str("path", strings.TrimSpace(entry.WorktreePath)).
					Msg("workspace.openProject: failed to open workspace")
				openErrors = append(openErrors, workspaceID+": "+err.Error())
				continue
			}
			openErrors = append(openErrors, err.Error())
			continue
		}
		if didOpenWorkspace {
			opened = append(opened, workspaceID)
			continue
		}
		skipped = append(skipped, workspaceID)
	}
	if len(opened) > 0 && h.tokenUsage != nil {
		h.tokenUsage.RequestRecentRecoveryScan("workspace.openProject")
	}

	return workspaceOpenProjectResult{
		Opened:  opened,
		Skipped: skipped,
		Errors:  openErrors,
	}, nil
}

// handleWorkspaceCloseProject stops all live terminal sessions for the given
// workspace IDs. It does not remove workspaces from memory or the index —
// those are preserved for daemon-restart recovery.
func (h *JSONRPCHandler) handleWorkspaceCloseProject(_ context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseProjectParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	stopped := []string{}
	for _, wsID := range req.WorkspaceIDs {
		wsID = strings.TrimSpace(wsID)
		if wsID == "" {
			continue
		}
		h.manager.Terminals().StopAllForWorkspace(wsID)
		stopped = append(stopped, wsID)
	}

	return workspaceCloseProjectResult{Stopped: stopped}, nil
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
