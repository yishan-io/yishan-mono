package daemon

import (
	"context"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// TerminalService implementation: each method performs one terminal operation.
// Subscribe/unsubscribe methods wire the PTY event stream to the calling
// connection.

func (h *JSONRPCHandler) TerminalStart(ctx context.Context, connection *rpc.Connection, req workspace.TerminalStartRequest) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.TerminalStart(ctx, req)
}

func (h *JSONRPCHandler) TerminalSend(ctx context.Context, req workspace.TerminalSendRequest) (any, error) {
	return h.manager.Terminals().Send(req)
}

func (h *JSONRPCHandler) TerminalRead(ctx context.Context, req workspace.TerminalReadRequest) (any, error) {
	return h.manager.Terminals().Read(req)
}

func (h *JSONRPCHandler) TerminalStop(ctx context.Context, req workspace.TerminalStopRequest) (any, error) {
	return h.manager.Terminals().Stop(req)
}

func (h *JSONRPCHandler) TerminalKillProcess(ctx context.Context, req workspace.TerminalKillProcessRequest) (any, error) {
	return h.manager.Terminals().KillProcess(req)
}

func (h *JSONRPCHandler) TerminalListSessions(ctx context.Context, req workspace.TerminalListSessionsRequest) (any, error) {
	return h.manager.Terminals().ListSessions(req), nil
}

func (h *JSONRPCHandler) TerminalListPorts(ctx context.Context) (any, error) {
	return h.manager.Terminals().ListDetectedPorts(), nil
}

func (h *JSONRPCHandler) TerminalResize(ctx context.Context, req workspace.TerminalResizeRequest) (any, error) {
	return h.manager.Terminals().Resize(req)
}

func (h *JSONRPCHandler) TerminalSubscribe(ctx context.Context, connection *rpc.Connection, req workspace.TerminalSubscribeRequest) (any, error) {
	subscription, err := h.manager.Terminals().Subscribe(req)
	if err != nil {
		return nil, err
	}
	connection.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = h.manager.Terminals().Unsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})
	return workspace.TerminalSubscribeResponse{Subscribed: true}, nil
}

func (h *JSONRPCHandler) TerminalUnsubscribe(ctx context.Context, connection *rpc.Connection, req workspace.TerminalUnsubscribeRequest) (any, error) {
	connection.DetachSubscription(req.SessionID)
	return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
}

func (h *JSONRPCHandler) TerminalRemoteSubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	return h.remoteSubscribe(connection, req)
}

func (h *JSONRPCHandler) TerminalRemoteUnsubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	return h.remoteUnsubscribe(connection, req)
}
