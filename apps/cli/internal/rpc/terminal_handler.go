package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/terminal"
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
		var req terminal.StartRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalStart(ctx, connection, req)
	case MethodTerminalSend:
		var req terminal.SendRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalSend(ctx, req)
	case MethodTerminalRead:
		var req terminal.ReadRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalRead(ctx, req)
	case MethodTerminalStop:
		var req terminal.StopRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalStop(ctx, req)
	case MethodTerminalKillProcess:
		var req terminal.KillProcessRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalKillProcess(ctx, req)
	case MethodTerminalListSessions:
		var req terminal.ListSessionsRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalListSessions(ctx, req)
	case MethodTerminalListPorts:
		return h.Services.TerminalListPorts(ctx)
	case MethodTerminalResize:
		var req terminal.ResizeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalResize(ctx, req)
	case MethodTerminalSubscribe:
		var req terminal.SubscribeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TerminalSubscribe(ctx, connection, req)
	case MethodTerminalUnsubscribe:
		var req terminal.UnsubscribeRequest
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
		return nil, NewRPCError(CodeMethodNotFound, "unknown terminal method: "+method)
	}
}
