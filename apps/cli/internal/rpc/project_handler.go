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
		return decodeAndCall(params, func(req ProjectListParams) (any, error) { return h.Services.List(ctx, req) })
	case MethodProjectListWithWkspaces:
		return decodeAndCall(params, func(req ProjectListWithWorkspacesParams) (any, error) {
			return h.Services.ListWithWorkspaces(ctx, req)
		})
	case MethodProjectCreate:
		return decodeAndCall(params, func(req ProjectCreateParams) (any, error) { return h.Services.Create(ctx, req) })
	case MethodProjectUpdate:
		return decodeAndCall(params, func(req ProjectUpdateParams) (any, error) { return h.Services.Update(ctx, req) })
	case MethodProjectDelete:
		return decodeAndCall(params, func(req ProjectRefParams) (any, error) { return h.Services.Delete(ctx, req) })
	case MethodProjectPromoteGit:
		return decodeAndCall(params, func(req ProjectPromoteGitParams) (any, error) { return h.Services.PromoteGit(ctx, req) })
	case MethodProjectEnsureTaskPrefix:
		return decodeAndCall(params, func(req ProjectRefParams) (any, error) { return h.Services.EnsureTaskPrefix(ctx, req) })
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown project method: "+method)
	}
}

// decodeAndCall decodes params into Request and invokes call.
func decodeAndCall[Request any](params json.RawMessage, call func(Request) (any, error)) (any, error) {
	var req Request
	if err := DecodeParams(params, &req); err != nil {
		return nil, err
	}
	return call(req)
}
