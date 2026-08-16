package terminal

import (
	"context"

	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
)

// TerminalService implementation: each method performs one terminal operation.
// Subscribe/unsubscribe methods wire the PTY event stream to the calling
// connection.

func (s *Service) Start(ctx context.Context, connection *rpc.Connection, req term.StartRequest) (any, error) {
	handle, err := s.deps.Workspace.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.TerminalStart(ctx, req)
}

func (s *Service) Send(ctx context.Context, req term.SendRequest) (any, error) {
	return s.deps.Terminals.Send(req)
}

func (s *Service) Read(ctx context.Context, req term.ReadRequest) (any, error) {
	return s.deps.Terminals.Read(req)
}

func (s *Service) Stop(ctx context.Context, req term.StopRequest) (any, error) {
	return s.deps.Terminals.Stop(req)
}

func (s *Service) KillProcess(ctx context.Context, req term.KillProcessRequest) (any, error) {
	return s.deps.Terminals.KillProcess(req)
}

func (s *Service) ListSessions(ctx context.Context, req term.ListSessionsRequest) (any, error) {
	return s.deps.Terminals.ListSessions(req), nil
}

func (s *Service) ListPorts(ctx context.Context) (any, error) {
	return s.deps.Terminals.ListDetectedPorts(), nil
}

func (s *Service) Resize(ctx context.Context, req term.ResizeRequest) (any, error) {
	return s.deps.Terminals.Resize(req)
}

func (s *Service) Subscribe(ctx context.Context, connection *rpc.Connection, req term.SubscribeRequest) (any, error) {
	subscription, err := s.deps.Terminals.Subscribe(req)
	if err != nil {
		return nil, err
	}
	connection.AttachSubscription(req.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = s.deps.Terminals.Unsubscribe(term.UnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})
	return term.SubscribeResponse{Subscribed: true}, nil
}

func (s *Service) Unsubscribe(ctx context.Context, connection *rpc.Connection, req term.UnsubscribeRequest) (any, error) {
	connection.DetachSubscription(req.SessionID)
	return term.UnsubscribeResponse{Unsubscribed: true}, nil
}

func (s *Service) RemoteSubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	return s.remoteSubscribe(connection, req)
}

func (s *Service) RemoteUnsubscribe(ctx context.Context, connection *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	return s.remoteUnsubscribe(connection, req)
}
