package rpc

import (
	"context"
	"encoding/json"
)

// ProjectHandler owns the project.* RPC namespace decoding.
type ProjectHandler struct {
	Services projectService
}

// Call implements Handler.
func (h *ProjectHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodProjectList:
		var req ProjectListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.List(ctx, req)
	case MethodProjectListWithWkspaces:
		var req ProjectListWithWorkspacesParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ListWithWorkspaces(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown project method: "+method)
	}
}
