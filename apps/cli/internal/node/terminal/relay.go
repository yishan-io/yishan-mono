package terminal

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"

	internalevents "yishan/apps/cli/internal/events"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
)

// The remote terminal stream subscription map is app-side state: it tracks
// which desktop connections on THIS node subscribe to a remote PTY session.
// The relay connection itself is owned by the relay client (internal/relay).

func (s *Service) addRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
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

func (s *Service) removeRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
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

func (s *Service) removeRemoteStreamSubsForConn(connState *rpc.Connection) []string {
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

func (s *Service) remoteStreamTargets(sessionID string) []*rpc.Connection {
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
func (s *Service) remoteSubscribe(connState *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
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
		"fromNode":  s.deps.NodeID,
	}); err != nil {
		s.removeRemoteStreamSub(req.SessionID, connState)
		return nil, rpc.NewRPCError(rpc.CodeServerError, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

// remoteUnsubscribe sends terminal.stream.cancel to the relay.
func (s *Service) remoteUnsubscribe(connState *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	if !s.removeRemoteStreamSub(req.SessionID, connState) {
		return map[string]bool{"ok": true}, nil
	}
	// Best-effort: the relay may be gone, in which case there is nothing to cancel.
	_ = s.relayClient.SendNotification(relay.MethodTerminalStreamCancel, map[string]string{
		"sessionId": req.SessionID,
		"fromNode":  s.deps.NodeID,
	})
	return map[string]bool{"ok": true}, nil
}

func (s *Service) forwardRemoteTerminalOutput(sessionID string, payload []byte) bool {
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

func (s *Service) forwardRemoteTerminalInput(sessionID string, payload []byte) bool {
	if len(s.remoteStreamTargets(sessionID)) == 0 {
		return false
	}
	if err := s.relayClient.SendBinary(payload); err != nil {
		log.Warn().Err(err).Str("sessionId", sessionID).Msg("remote terminal input forward failed")
		return false
	}
	return true
}

// HandleBinaryFrame implements rpc.BinaryFrameHandler: terminal I/O frames
// are forwarded to a remote node when the session is remote, or written to
// the local PTY directly.
func (s *Service) HandleBinaryFrame(connection *rpc.Connection, opcode byte, sessionID string, payload []byte) {
	switch opcode {
	case binOpcodeTerminalInput:
		if s.forwardRemoteTerminalInput(sessionID, payload) {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		inputData := terminalInputData(payload)
		if len(inputData) == 0 {
			return
		}
		s.deps.Terminals.SendRaw(sessionID, inputData)
	case binOpcodeTerminalOutput:
		s.forwardRemoteTerminalOutput(sessionID, payload)
	}
}

// terminalInputData slices the payload after the null-terminated session id.
func terminalInputData(payload []byte) []byte {
	nullIdx := bytes.IndexByte(payload[1:], 0)
	if nullIdx < 0 {
		return nil
	}
	return payload[1+nullIdx+1:]
}

// HandleRelayMessage implements relay.MessageHandler for the relay-level
// terminal messages the relay client does not own: terminal session changes
// and remote stream request/accept/cancel notifications. Job dispatch and
// workspace snapshot changes are handled by the system and workspace
// application services.
func (s *Service) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
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

// publishTerminalSessionChanged republishes relay terminal session changes as
// frontend events.
func publishTerminalSessionChanged(handler *Service, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal session changed params")
			return
		}
	}
	if payload == nil {
		payload = map[string]any{}
	}

	sessionID, _ := payload["sessionId"].(string)
	workspaceID, _ := payload["workspaceId"].(string)
	action, _ := payload["action"].(string)
	log.Info().
		Str("sessionId", strings.TrimSpace(sessionID)).
		Str("workspaceId", strings.TrimSpace(workspaceID)).
		Str("action", strings.TrimSpace(action)).
		Msg("relay: terminal session change received")

	handler.deps.Events.Publish(internalevents.Event{Topic: "terminalSessionChanged", Payload: payload})
}

// handleTerminalStreamRequest is called on the owning daemon (daemon A) when
// another node wants to subscribe to a PTY session. It subscribes the relay
// connState to the local terminal session so output flows back over /ws.
func handleTerminalStreamRequest(handler *Service, connState *rpc.Connection, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
		FromNode  string `json:"fromNode"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		log.Warn().Err(err).Msg("relay: invalid terminal.stream.request params")
		return
	}

	subscription, err := handler.deps.Terminals.Subscribe(term.SubscribeRequest{SessionID: p.SessionID})
	if err != nil {
		log.Warn().Err(err).Str("sessionId", p.SessionID).Msg("relay: terminal.stream.request subscribe failed")
		return
	}
	connState.AttachSubscription(p.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = handler.deps.Terminals.Unsubscribe(term.UnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
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
func publishTerminalStreamAccept(handler *Service, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.accept params")
			return
		}
	}
	handler.deps.Events.Publish(internalevents.Event{Topic: "terminalStreamAccepted", Payload: payload})
}

// publishTerminalStreamCancel notifies the desktop that a remote stream was cancelled.
func publishTerminalStreamCancel(handler *Service, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.cancel params")
			return
		}
	}
	handler.deps.Events.Publish(internalevents.Event{Topic: "terminalStreamCancelled", Payload: payload})
}
