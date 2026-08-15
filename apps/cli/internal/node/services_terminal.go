package node

import (
	"context"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
)

// TerminalService implementation: each method performs one terminal operation.
// Subscribe/unsubscribe methods wire the PTY event stream to the calling
// connection.

func (s *Service) TerminalStart(ctx context.Context, connection *rpc.Connection, req terminal.StartRequest) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.TerminalStart(ctx, req)
}

func (s *Service) TerminalSend(ctx context.Context, req terminal.SendRequest) (any, error) {
	return s.deps.Terminals.Send(req)
}

func (s *Service) TerminalRead(ctx context.Context, req terminal.ReadRequest) (any, error) {
	return s.deps.Terminals.Read(req)
}

func (s *Service) TerminalStop(ctx context.Context, req terminal.StopRequest) (any, error) {
	return s.deps.Terminals.Stop(req)
}

func (s *Service) TerminalKillProcess(ctx context.Context, req terminal.KillProcessRequest) (any, error) {
	return s.deps.Terminals.KillProcess(req)
}

func (s *Service) TerminalListSessions(ctx context.Context, req terminal.ListSessionsRequest) (any, error) {
	return s.deps.Terminals.ListSessions(req), nil
}

func (s *Service) TerminalListPorts(ctx context.Context) (any, error) {
	return s.deps.Terminals.ListDetectedPorts(), nil
}

func (s *Service) TerminalResize(ctx context.Context, req terminal.ResizeRequest) (any, error) {
	return s.deps.Terminals.Resize(req)
}

func (s *Service) TerminalSubscribe(ctx context.Context, connection *rpc.Connection, req terminal.SubscribeRequest) (any, error) {
	subscription, err := s.deps.Terminals.Subscribe(req)
	if err != nil {
		return nil, err
	}
	connection.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = s.deps.Terminals.Unsubscribe(terminal.UnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})
	return terminal.SubscribeResponse{Subscribed: true}, nil
}

func (s *Service) TerminalUnsubscribe(ctx context.Context, connection *rpc.Connection, req terminal.UnsubscribeRequest) (any, error) {
	connection.DetachSubscription(req.SessionID)
	return terminal.UnsubscribeResponse{Unsubscribed: true}, nil
}

func (s *Service) TerminalRemoteSubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	return s.remoteSubscribe(connection, req)
}

func (s *Service) TerminalRemoteUnsubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	return s.remoteUnsubscribe(connection, req)
}
