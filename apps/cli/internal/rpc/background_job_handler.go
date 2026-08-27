package rpc

import (
	"context"
	"encoding/json"
)

// BackgroundJobHandler owns backgroundJob.* RPC decoding.
type BackgroundJobHandler struct {
	Services BackgroundJobService
}

// Call implements Handler.
func (h *BackgroundJobHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodBackgroundJobCreate:
		return callBackgroundJob(ctx, params, h.Services.Create)
	case MethodBackgroundJobGet:
		return callBackgroundJob(ctx, params, h.Services.Get)
	case MethodBackgroundJobList:
		return callBackgroundJob(ctx, params, h.Services.List)
	case MethodBackgroundJobCancel:
		return callBackgroundJob(ctx, params, h.Services.Cancel)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown backgroundJob method: "+method)
	}
}

func callBackgroundJob[Params any](ctx context.Context, params json.RawMessage, call func(context.Context, Params) (any, error)) (any, error) {
	var request Params
	if err := DecodeParams(params, &request); err != nil {
		return nil, err
	}
	return call(ctx, request)
}
