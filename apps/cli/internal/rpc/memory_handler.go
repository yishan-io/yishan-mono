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
		return h.Services.MemorySearch(ctx, req)
	case MethodMemoryReconcile:
		return h.Services.MemoryReconcile(ctx)
	case MethodMemoryStatus:
		return h.Services.MemoryStatus(ctx)
	case MethodMemoryGetConfig:
		return h.Services.MemoryGetConfig(ctx)
	case MethodMemoryUpdateConfig:
		var req MemoryUpdateConfigParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.MemoryUpdateConfig(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown memory method: "+method)
	}
}
