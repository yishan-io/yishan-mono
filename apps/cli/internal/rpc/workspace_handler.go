package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
)

// WorkspaceHandler owns the workspace.* (and list) RPC namespace decoding.
// Each method decodes its params and calls exactly one application method on
// WorkspaceService. It holds no state and constructs no services.
type WorkspaceHandler struct {
	Services WorkspaceService
}

// Call implements Handler.
func (h *WorkspaceHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodList:
		return h.Services.ListWorkspaces()
	case MethodWorkspaceCreate:
		var req WorkspaceCreateParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceCreate(ctx, req)
	case MethodWorkspaceClose:
		var req WorkspaceCloseParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceClose(ctx, req)
	case MethodWorkspaceRefreshPullRequest:
		var req workspace.RefreshPullRequestRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceRefreshPullRequest(ctx, req)
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceSyncContextLink(ctx, req)
	case MethodWorkspaceSetActive:
		var req terminal.SetActiveWorkspaceRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceSetActive(ctx, req)
	case MethodWorkspaceHealth:
		var req WorkspaceHealthParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceHealth(ctx, req)
	case MethodWorkspaceOpenProject:
		var req WorkspaceOpenProjectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceOpenProject(ctx, req)
	case MethodWorkspaceCloseProject:
		var req WorkspaceCloseProjectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceCloseProject(ctx, req)
	case MethodWorkspaceCreateLocalFolder:
		var req WorkspaceCreateLocalFolderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceCreateLocalFolder(ctx, req)
	case MethodWorkspaceListLocalFolders:
		return h.Services.WorkspaceListLocalFolders(ctx)
	case MethodWorkspaceDeleteLocalFolder:
		var req WorkspaceDeleteLocalFolderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorkspaceDeleteLocalFolder(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown workspace method: "+method)
	}
}
