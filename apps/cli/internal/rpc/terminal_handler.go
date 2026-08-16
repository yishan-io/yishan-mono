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
		return h.Services.Start(ctx, connection, req)
	case MethodTerminalSend:
		var req terminal.SendRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Send(ctx, req)
	case MethodTerminalRead:
		var req terminal.ReadRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Read(ctx, req)
	case MethodTerminalStop:
		var req terminal.StopRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Stop(ctx, req)
	case MethodTerminalKillProcess:
		var req terminal.KillProcessRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.KillProcess(ctx, req)
	case MethodTerminalListSessions:
		var req terminal.ListSessionsRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ListSessions(ctx, req)
	case MethodTerminalListPorts:
		return h.Services.ListPorts(ctx)
	case MethodTerminalResize:
		var req terminal.ResizeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Resize(ctx, req)
	case MethodTerminalSubscribe:
		var req terminal.SubscribeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Subscribe(ctx, connection, req)
	case MethodTerminalUnsubscribe:
		var req terminal.UnsubscribeRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Unsubscribe(ctx, connection, req)
	case MethodTerminalRemoteSubscribe:
		var req TerminalRemoteSubscribeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.RemoteSubscribe(ctx, connection, req)
	case MethodTerminalRemoteUnsubscribe:
		var req TerminalRemoteUnsubscribeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.RemoteUnsubscribe(ctx, connection, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown terminal method: "+method)
	}
}
