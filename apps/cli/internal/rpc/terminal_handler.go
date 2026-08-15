package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
)

// TerminalHandler owns the terminal.* RPC namespace decoding. Connection-bound
// subscriptions receive the live connection so the service can stream PTY
// output frames to the client.
type TerminalHandler struct {
	Services TerminalService
}

// Call implements Handler.
func (h *TerminalHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodTerminalStart:
		var req workspace.TerminalStartRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalStart(ctx, connection, req)
	case MethodTerminalSend:
		var req workspace.TerminalSendRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalSend(ctx, req)
	case MethodTerminalRead:
		var req workspace.TerminalReadRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalRead(ctx, req)
	case MethodTerminalStop:
		var req workspace.TerminalStopRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalStop(ctx, req)
	case MethodTerminalKillProcess:
		var req workspace.TerminalKillProcessRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalKillProcess(ctx, req)
	case MethodTerminalListSessions:
		var req workspace.TerminalListSessionsRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalListSessions(ctx, req)
	case MethodTerminalListPorts:
		return h.Services.TerminalListPorts(ctx)
	case MethodTerminalResize:
		var req workspace.TerminalResizeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalResize(ctx, req)
	case MethodTerminalSubscribe:
		var req workspace.TerminalSubscribeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalSubscribe(ctx, connection, req)
	case MethodTerminalUnsubscribe:
		var req workspace.TerminalUnsubscribeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalUnsubscribe(ctx, connection, req)
	case MethodTerminalRemoteSubscribe:
		var req TerminalRemoteSubscribeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalRemoteSubscribe(ctx, connection, req)
	case MethodTerminalRemoteUnsubscribe:
		var req TerminalRemoteUnsubscribeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalRemoteUnsubscribe(ctx, connection, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown terminal method: "+method)
	}
}
