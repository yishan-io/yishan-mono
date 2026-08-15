package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *rpc.Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodList:
		return h.manager.Instances().List(), nil
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
	case MethodWorkspaceOpenProject:
		return h.handleWorkspaceOpenProject(ctx, params)
	case MethodWorkspaceCloseProject:
		return h.handleWorkspaceCloseProject(ctx, params)
	case MethodWorkspaceCreateLocalFolder:
		return h.handleWorkspaceCreateLocalFolder(ctx, params)
	case MethodWorkspaceListLocalFolders:
		return h.handleWorkspaceListLocalFolders(ctx, params)
	case MethodWorkspaceDeleteLocalFolder:
		return h.handleWorkspaceDeleteLocalFolder(ctx, params)
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
			return h.getWorkspace(workspaceID)
		}
		resolvedWorkspace, ok := h.manager.Instances().GetByPath(workspacePath)
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

	refreshedWorkspace, err := h.getWorkspace(ws.ID)
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
	result, err := h.app.Close(ctx, application.CloseCommand(req))
	if err != nil {
		return nil, err
	}
	if result.Relayed {
		return map[string]any{"workspaceId": result.WorkspaceID, "status": result.Status}, nil
	}
	return map[string]any{
		"workspace":   map[string]string{"id": result.WorkspaceID, "status": result.Status},
		"workspaceId": result.WorkspaceID,
	}, nil
}
