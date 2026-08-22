package rpc

import (
	"context"
	"encoding/json"
)

// LocalTaskHandler owns the localTask.* RPC namespace decoding.
type LocalTaskHandler struct {
	Services LocalTaskService
}

// Call implements Handler.
func (h *LocalTaskHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodLocalTaskCreate:
		return callLocalTask(ctx, params, h.Services.Create)
	case MethodLocalTaskGet:
		return callLocalTask(ctx, params, h.Services.Get)
	case MethodLocalTaskGetContextDetails:
		return callLocalTask(ctx, params, h.Services.GetContextDetails)
	case MethodLocalTaskList:
		return callLocalTask(ctx, params, h.Services.List)
	case MethodLocalTaskUpdate:
		return callLocalTask(ctx, params, h.Services.Update)
	case MethodLocalTaskSearch:
		return callLocalTask(ctx, params, h.Services.Search)
	case MethodLocalTaskLinkWorkspace:
		return callLocalTask(ctx, params, h.Services.LinkWorkspace)
	case MethodLocalTaskUnlinkWorkspace:
		return callLocalTask(ctx, params, h.Services.UnlinkWorkspace)
	case MethodLocalTaskUpdateWorkspaceLinkStatus:
		return callLocalTask(ctx, params, h.Services.UpdateWorkspaceLinkStatus)
	case MethodLocalTaskSetPrimary:
		return callLocalTask(ctx, params, h.Services.SetPrimary)
	case MethodLocalTaskListWorkspaceLinks:
		return callLocalTask(ctx, params, h.Services.ListWorkspaceLinks)
	case MethodLocalTaskListTaskLinks:
		return callLocalTask(ctx, params, h.Services.ListTaskLinks)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown localTask method: "+method)
	}
}

func callLocalTask[Params any](ctx context.Context, params json.RawMessage, call func(context.Context, Params) (any, error)) (any, error) {
	var req Params
	if err := DecodeParams(params, &req); err != nil {
		return nil, err
	}
	return call(ctx, req)
}
