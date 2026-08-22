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
		return h.Services.Create(ctx, req)
	case MethodWorkspaceClose:
		var req WorkspaceCloseParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Close(ctx, req)
	case MethodWorkspaceRefreshPullRequest:
		var req workspace.RefreshPullRequestRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.RefreshPullRequest(ctx, req)
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SyncContextLink(ctx, req)
	case MethodWorkspaceSetActive:
		var req terminal.SetActiveWorkspaceRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SetActive(ctx, req)
	case MethodWorkspaceHealth:
		var req WorkspaceHealthParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Health(ctx, req)
	case MethodWorkspaceOpenProject:
		var req WorkspaceOpenProjectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.OpenProject(ctx, req)
	case MethodWorkspaceCloseProject:
		var req WorkspaceCloseProjectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CloseProject(ctx, req)
	case MethodWorkspaceImportLocalPath:
		var req WorkspaceImportLocalPathParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ImportLocalPath(ctx, req)
	case MethodWorkspaceListLocalFolders:
		return h.Services.ListLocalFolders(ctx)
	case MethodWorkspaceDeleteLocalFolder:
		var req WorkspaceDeleteLocalFolderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.DeleteLocalFolder(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown workspace method: "+method)
	}
}
