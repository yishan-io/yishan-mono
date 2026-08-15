package node

import (
	"context"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
)

// TerminalService implementation: each method performs one terminal operation.
// Subscribe/unsubscribe methods wire the PTY event stream to the calling
// connection.

func (s *Services) TerminalStart(ctx context.Context, connection *rpc.Connection, req terminal.StartRequest) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.TerminalStart(ctx, req)
}

func (s *Services) TerminalSend(ctx context.Context, req terminal.SendRequest) (any, error) {
	return s.terminals.Send(req)
}

func (s *Services) TerminalRead(ctx context.Context, req terminal.ReadRequest) (any, error) {
	return s.terminals.Read(req)
}

func (s *Services) TerminalStop(ctx context.Context, req terminal.StopRequest) (any, error) {
	return s.terminals.Stop(req)
}

func (s *Services) TerminalKillProcess(ctx context.Context, req terminal.KillProcessRequest) (any, error) {
	return s.terminals.KillProcess(req)
}

func (s *Services) TerminalListSessions(ctx context.Context, req terminal.ListSessionsRequest) (any, error) {
	return s.terminals.ListSessions(req), nil
}

func (s *Services) TerminalListPorts(ctx context.Context) (any, error) {
	return s.terminals.ListDetectedPorts(), nil
}

func (s *Services) TerminalResize(ctx context.Context, req terminal.ResizeRequest) (any, error) {
	return s.terminals.Resize(req)
}

func (s *Services) TerminalSubscribe(ctx context.Context, connection *rpc.Connection, req terminal.SubscribeRequest) (any, error) {
	subscription, err := s.terminals.Subscribe(req)
	if err != nil {
		return nil, err
	}
	connection.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = s.terminals.Unsubscribe(terminal.UnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})
	return terminal.SubscribeResponse{Subscribed: true}, nil
}

func (s *Services) TerminalUnsubscribe(ctx context.Context, connection *rpc.Connection, req terminal.UnsubscribeRequest) (any, error) {
	connection.DetachSubscription(req.SessionID)
	return terminal.UnsubscribeResponse{Unsubscribed: true}, nil
}

func (s *Services) TerminalRemoteSubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	return s.remoteSubscribe(connection, req)
}

func (s *Services) TerminalRemoteUnsubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	return s.remoteUnsubscribe(connection, req)
}
