package rpc

import (
	"context"
	"encoding/json"
)

// ContextHandler owns the context.* RPC namespace decoding.
type ContextHandler struct {
	Services ContextService
}

// Call implements Handler.
func (h *ContextHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodContextGetState:
		return h.Services.GetState()
	case MethodContextSetCurrentOrg:
		var req ContextSetCurrentOrgParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SetCurrentOrg(ctx, req)
	case MethodContextSetActiveProject:
		var req ContextSetActiveProjectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SetActiveProject(ctx, req)
	case MethodContextSetActiveFile:
		var req ContextSetActiveFileParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SetActiveFile(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown context method: "+method)
	}
}
