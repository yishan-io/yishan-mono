package rpc

import (
	"context"
	"encoding/json"
)

// MemoryHandler owns the memory.* RPC namespace decoding.
type MemoryHandler struct {
	Services MemoryService
}

// Call implements Handler.
func (h *MemoryHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodMemorySearch:
		var req MemorySearchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Search(ctx, req)
	case MethodMemoryReconcile:
		return h.Services.Reconcile(ctx)
	case MethodMemoryStatus:
		return h.Services.Status(ctx)
	case MethodMemoryGetConfig:
		return h.Services.Config(ctx)
	case MethodMemoryUpdateConfig:
		var req MemoryUpdateConfigParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SetConfig(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown memory method: "+method)
	}
}
