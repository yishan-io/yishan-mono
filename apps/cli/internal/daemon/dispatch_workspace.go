package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
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
				return nil, err
			}
		}
		return nil, err
	}
	if h.cleanupStore != nil {
		if err := h.cleanupStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace cleanup entry after close")
		}
	}
	if h.wsIndexStore != nil {
		if err := h.wsIndexStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace index entry after close")
		}
	}
	h.clearAgentUsage(req.WorkspaceID)

	return map[string]any{
		"workspace":   map[string]string{"id": req.WorkspaceID, "status": "closed"},
		"workspaceId": req.WorkspaceID,
	}, nil
}
