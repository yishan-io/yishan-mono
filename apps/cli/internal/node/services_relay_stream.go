package node

import (
	"context"
	"encoding/json"
	internalevents "yishan/apps/cli/internal/events"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/terminal"
)

// The remote terminal stream subscription map is app-side state: it tracks
// which desktop connections on THIS node subscribe to a remote PTY session.
// The relay connection itself is owned by the relay client (internal/relay).

func (s *Services) addRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
	s.remoteStreamMu.Lock()
	defer s.remoteStreamMu.Unlock()
	subs := s.remoteStreamSubs[sessionID]
	if subs == nil {
		subs = make(map[*rpc.Connection]struct{})
		s.remoteStreamSubs[sessionID] = subs
	}
	_, existed := subs[connState]
	subs[connState] = struct{}{}
	return !existed && len(subs) == 1
}

func (s *Services) removeRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
	s.remoteStreamMu.Lock()
	defer s.remoteStreamMu.Unlock()
	subs := s.remoteStreamSubs[sessionID]
	if subs == nil {
		return false
	}
	delete(subs, connState)
	if len(subs) == 0 {
		delete(s.remoteStreamSubs, sessionID)
		return true
	}
	return false
}

func (s *Services) removeRemoteStreamSubsForConn(connState *rpc.Connection) []string {
	s.remoteStreamMu.Lock()
	defer s.remoteStreamMu.Unlock()
	var emptied []string
	for sessionID, subs := range s.remoteStreamSubs {
		if _, ok := subs[connState]; !ok {
			continue
		}
		delete(subs, connState)
		if len(subs) == 0 {
			delete(s.remoteStreamSubs, sessionID)
			emptied = append(emptied, sessionID)
		}
	}
	return emptied
}

func (s *Services) remoteStreamTargets(sessionID string) []*rpc.Connection {
	s.remoteStreamMu.Lock()
	defer s.remoteStreamMu.Unlock()
	subs := s.remoteStreamSubs[sessionID]
	if len(subs) == 0 {
		return nil
	}
	targets := make([]*rpc.Connection, 0, len(subs))
	for conn := range subs {
		targets = append(targets, conn)
	}
	return targets
}

// remoteSubscribe sends terminal.stream.request to the relay so the owning
// daemon starts forwarding PTY output for sessionId to this node.
func (s *Services) remoteSubscribe(connState *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	firstSub := s.addRemoteStreamSub(req.SessionID, connState)
	connState.AddCloseHook(func() {
		for _, sessionID := range s.removeRemoteStreamSubsForConn(connState) {
			_, _ = s.remoteUnsubscribe(connState, rpc.TerminalRemoteUnsubscribeParams{SessionID: sessionID})
		}
	})
	if !firstSub {
		return map[string]bool{"ok": true}, nil
	}
	if err := s.relayClient.SendNotification(relay.MethodTerminalStreamRequest, map[string]string{
		"sessionId": req.SessionID,
		"ownerNode": req.OwnerNode,
		"fromNode":  s.nodeID,
	}); err != nil {
		s.removeRemoteStreamSub(req.SessionID, connState)
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

// remoteUnsubscribe sends terminal.stream.cancel to the relay.
func (s *Services) remoteUnsubscribe(connState *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	if !s.removeRemoteStreamSub(req.SessionID, connState) {
		return map[string]bool{"ok": true}, nil
	}
	// Best-effort: the relay may be gone, in which case there is nothing to cancel.
	_ = s.relayClient.SendNotification(relay.MethodTerminalStreamCancel, map[string]string{
		"sessionId": req.SessionID,
		"fromNode":  s.nodeID,
	})
	return map[string]bool{"ok": true}, nil
}

func (s *Services) forwardRemoteTerminalOutput(sessionID string, payload []byte) bool {
	targets := s.remoteStreamTargets(sessionID)
	if len(targets) == 0 {
		return false
	}
	for _, target := range targets {
		if err := target.WriteBinary(payload); err != nil {
			log.Warn().Err(err).Str("sessionId", sessionID).Msg("remote terminal output forward failed")
		}
	}
	return true
}

func (s *Services) forwardRemoteTerminalInput(sessionID string, payload []byte) bool {
	if len(s.remoteStreamTargets(sessionID)) == 0 {
		return false
	}
	if err := s.relayClient.SendBinary(payload); err != nil {
		log.Warn().Err(err).Str("sessionId", sessionID).Msg("remote terminal input forward failed")
		return false
	}
	return true
}

// HandleRelayMessage implements relay.MessageHandler for the relay-level
// messages the relay client does not own: job dispatch, workspace snapshot
// changes, and terminal session/stream notifications.
func (s *Services) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodJobRun:
		handleJobRun(s.runtime, connState, nodeID, params)
		return true
	case relay.MethodWorkspaceSnapshotChanged:
		publishWorkspaceSnapshotChanged(s, params)
		return true
	case relay.MethodTerminalSessionChanged:
		publishTerminalSessionChanged(s, params)
		return true
	case relay.MethodTerminalStreamRequest:
		handleTerminalStreamRequest(s, connState, params)
		return true
	case relay.MethodTerminalStreamAccept:
		publishTerminalStreamAccept(s, params)
		return true
	case relay.MethodTerminalStreamCancel:
		publishTerminalStreamCancel(s, params)
		return true
	default:
		return false
	}
}

// handleTerminalStreamRequest is called on the owning daemon (daemon A) when
// another node wants to subscribe to a PTY session. It subscribes the relay
// connState to the local terminal session so output flows back over /ws.
func handleTerminalStreamRequest(handler *Services, connState *rpc.Connection, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
		FromNode  string `json:"fromNode"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		log.Warn().Err(err).Msg("relay: invalid terminal.stream.request params")
		return
	}

	subscription, err := handler.terminals.Subscribe(terminal.SubscribeRequest{SessionID: p.SessionID})
	if err != nil {
		log.Warn().Err(err).Str("sessionId", p.SessionID).Msg("relay: terminal.stream.request subscribe failed")
		return
	}
	connState.AttachSubscription(p.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = handler.terminals.Unsubscribe(terminal.UnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
	})

	// Acknowledge the stream to the relay (relay forwards to subscriber).
	acceptNotif := rpc.Notification{
		JSONRPC: "2.0",
		Method:  relay.MethodTerminalStreamAccept,
		Params:  map[string]string{"sessionId": p.SessionID},
	}
	if err := connState.WriteJSON(acceptNotif); err != nil {
		log.Warn().Err(err).Str("sessionId", p.SessionID).Msg("relay: failed to send terminal.stream.accept")
	}
}

// publishTerminalStreamAccept notifies the desktop that a remote stream was accepted.
func publishTerminalStreamAccept(handler *Services, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.accept params")
			return
		}
	}
	handler.events.Publish(internalevents.Event{Topic: "terminalStreamAccepted", Payload: payload})
}

// publishTerminalStreamCancel notifies the desktop that a remote stream was cancelled.
func publishTerminalStreamCancel(handler *Services, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.cancel params")
			return
		}
	}
	handler.events.Publish(internalevents.Event{Topic: "terminalStreamCancelled", Payload: payload})
}
