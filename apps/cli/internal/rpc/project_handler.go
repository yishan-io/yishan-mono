package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpcerror"
)

// ProjectHandler owns the project.* RPC namespace decoding.
type ProjectHandler struct {
	Services ProjectService
}

// Call implements Handler.
func (h *ProjectHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodProjectList:
		var req ProjectListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ProjectList(ctx, req)
	case MethodProjectListWithWkspaces:
		var req ProjectListWithWorkspacesParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ProjectListWithWorkspaces(ctx, req)
	case MethodProjectGetListPreferences:
		var req ProjectGetListPreferencesParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ProjectGetListPreferences(ctx, req)
	case MethodProjectSetListPreferences:
		var req ProjectSetListPreferencesParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ProjectSetListPreferences(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown project method: "+method)
	}
}
