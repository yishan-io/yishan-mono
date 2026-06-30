package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/workspace"
)
func (h *JSONRPCHandler) dispatchTerminal(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodTerminalStart:
		var req workspace.TerminalStartRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		handle, err := h.manager.WorkspaceHandle(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		return handle.TerminalStart(ctx, req)
	case MethodTerminalSend:
		var req workspace.TerminalSendRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().Send(req)
	case MethodTerminalRead:
		var req workspace.TerminalReadRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().Read(req)
	case MethodTerminalStop:
		var req workspace.TerminalStopRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().Stop(req)
	case MethodTerminalKillProcess:
		var req workspace.TerminalKillProcessRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().KillProcess(req)
	case MethodTerminalListSessions:
		var req workspace.TerminalListSessionsRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().ListSessions(req), nil
	case MethodTerminalListPorts:
		return h.manager.Terminals().ListDetectedPorts(), nil
	case MethodTerminalResize:
		var req workspace.TerminalResizeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().Resize(req)
	case MethodTerminalSubscribe:
		var req workspace.TerminalSubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		subscription, err := h.manager.Terminals().Subscribe(req)
		if err != nil {
			return nil, err
		}
		connState.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
			_, _ = h.manager.Terminals().Unsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
		})
		return workspace.TerminalSubscribeResponse{
			Subscribed: true,
			Snapshot:   &subscription.Snapshot,
		}, nil
	case MethodTerminalUnsubscribe:
		var req workspace.TerminalUnsubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		connState.DetachSubscription(req.SessionID)
		return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
	case MethodTerminalRemoteSubscribe:
		var req terminalRemoteSubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.remoteSubscribe(connState, req)
	case MethodTerminalRemoteUnsubscribe:
		var req terminalRemoteUnsubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.remoteUnsubscribe(connState, req)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown terminal method: "+method)
	}
}
