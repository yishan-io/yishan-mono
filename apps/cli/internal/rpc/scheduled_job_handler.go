package rpc

import (
	"context"
	"encoding/json"
)

// scheduledJobService backs the scheduledJob.* RPC namespace.
type scheduledJobService interface {
	List(ctx context.Context, req ScheduledJobListParams) (any, error)
	Create(ctx context.Context, req ScheduledJobCreateParams) (any, error)
	Update(ctx context.Context, req ScheduledJobUpdateParams) (any, error)
	Pause(ctx context.Context, req ScheduledJobRefParams) (any, error)
	Resume(ctx context.Context, req ScheduledJobRefParams) (any, error)
	Delete(ctx context.Context, req ScheduledJobRefParams) (any, error)
	ListRuns(ctx context.Context, req ScheduledJobListRunsParams) (any, error)
	RunNow(ctx context.Context, req ScheduledJobRefParams) (any, error)
}

// ScheduledJobHandler owns the scheduledJob.* RPC namespace decoding.
type ScheduledJobHandler struct {
	Services scheduledJobService
}

// Call implements Handler.
func (h *ScheduledJobHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	refCalls := map[string]func(context.Context, ScheduledJobRefParams) (any, error){
		MethodScheduledJobPause: h.Services.Pause, MethodScheduledJobResume: h.Services.Resume,
		MethodScheduledJobDelete: h.Services.Delete, MethodScheduledJobRunNow: h.Services.RunNow,
	}
	if call, ok := refCalls[method]; ok {
		return decodeAndCall(params, func(req ScheduledJobRefParams) (any, error) { return call(ctx, req) })
	}
	switch method {
	case MethodScheduledJobList:
		return decodeAndCall(params, func(req ScheduledJobListParams) (any, error) { return h.Services.List(ctx, req) })
	case MethodScheduledJobCreate:
		return decodeAndCall(params, func(req ScheduledJobCreateParams) (any, error) { return h.Services.Create(ctx, req) })
	case MethodScheduledJobUpdate:
		return decodeAndCall(params, func(req ScheduledJobUpdateParams) (any, error) { return h.Services.Update(ctx, req) })
	case MethodScheduledJobListRuns:
		return decodeAndCall(params, func(req ScheduledJobListRunsParams) (any, error) { return h.Services.ListRuns(ctx, req) })
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown scheduledJob method: "+method)
	}
}
