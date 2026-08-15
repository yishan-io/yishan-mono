package node

import (
	"context"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// TerminalService implementation: each method performs one terminal operation.
// Subscribe/unsubscribe methods wire the PTY event stream to the calling
// connection.

func (s *Services) TerminalStart(ctx context.Context, connection *rpc.Connection, req workspace.TerminalStartRequest) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.TerminalStart(ctx, req)
}

func (s *Services) TerminalSend(ctx context.Context, req workspace.TerminalSendRequest) (any, error) {
	return s.manager.Terminals().Send(req)
}

func (s *Services) TerminalRead(ctx context.Context, req workspace.TerminalReadRequest) (any, error) {
	return s.manager.Terminals().Read(req)
}

func (s *Services) TerminalStop(ctx context.Context, req workspace.TerminalStopRequest) (any, error) {
	return s.manager.Terminals().Stop(req)
}

func (s *Services) TerminalKillProcess(ctx context.Context, req workspace.TerminalKillProcessRequest) (any, error) {
	return s.manager.Terminals().KillProcess(req)
}

func (s *Services) TerminalListSessions(ctx context.Context, req workspace.TerminalListSessionsRequest) (any, error) {
	return s.manager.Terminals().ListSessions(req), nil
}

func (s *Services) TerminalListPorts(ctx context.Context) (any, error) {
	return s.manager.Terminals().ListDetectedPorts(), nil
}

func (s *Services) TerminalResize(ctx context.Context, req workspace.TerminalResizeRequest) (any, error) {
	return s.manager.Terminals().Resize(req)
}

func (s *Services) TerminalSubscribe(ctx context.Context, connection *rpc.Connection, req workspace.TerminalSubscribeRequest) (any, error) {
	subscription, err := s.manager.Terminals().Subscribe(req)
	if err != nil {
		return nil, err
	}
	connection.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = s.manager.Terminals().Unsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})
	return workspace.TerminalSubscribeResponse{Subscribed: true}, nil
}

func (s *Services) TerminalUnsubscribe(ctx context.Context, connection *rpc.Connection, req workspace.TerminalUnsubscribeRequest) (any, error) {
	connection.DetachSubscription(req.SessionID)
	return workspace.TerminalUnsubscribeResponse{Unsubscribed: true}, nil
}

func (s *Services) TerminalRemoteSubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	return s.remoteSubscribe(connection, req)
}

func (s *Services) TerminalRemoteUnsubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	return s.remoteUnsubscribe(connection, req)
}
