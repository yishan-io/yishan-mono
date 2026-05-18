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
		return h.manager.TerminalStart(ctx, req)
	case MethodTerminalSend:
		var req workspace.TerminalSendRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalSend(req)
	case MethodTerminalRead:
		var req workspace.TerminalReadRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalRead(req)
	case MethodTerminalStop:
		var req workspace.TerminalStopRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalStop(req)
	case MethodTerminalKillProcess:
		var req workspace.TerminalKillProcessRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalKillProcess(req)
	case MethodTerminalListSessions:
		var req workspace.TerminalListSessionsRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalListSessions(req), nil
	case MethodTerminalListPorts:
		return h.manager.TerminalListDetectedPorts(), nil
	case MethodTerminalResize:
		var req workspace.TerminalResizeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.TerminalResize(req)
	case MethodTerminalSubscribe:
		var req workspace.TerminalSubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		subscription, err := h.manager.TerminalSubscribe(req)
		if err != nil {
			return nil, err
		}
		connState.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
			_, _ = h.manager.TerminalUnsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
		})
		return workspace.TerminalSubscribeResponse{Subscribed: true}, nil
	case MethodTerminalUnsubscribe:
		var req workspace.TerminalUnsubscribeRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		connState.DetachSubscription(req.SessionID)
		return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown terminal method: "+method)
	}
}
