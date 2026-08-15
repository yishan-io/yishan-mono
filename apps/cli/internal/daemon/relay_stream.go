package daemon

import (
	"context"
	"encoding/json"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// The remote terminal stream subscription map is app-side state: it tracks
// which desktop connections on THIS node subscribe to a remote PTY session.
// The relay connection itself is owned by the relay client (internal/relay).

func (h *JSONRPCHandler) addRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
	h.remoteStreamMu.Lock()
	defer h.remoteStreamMu.Unlock()
	subs := h.remoteStreamSubs[sessionID]
	if subs == nil {
		subs = make(map[*rpc.Connection]struct{})
		h.remoteStreamSubs[sessionID] = subs
	}
	_, existed := subs[connState]
	subs[connState] = struct{}{}
	return !existed && len(subs) == 1
}

func (h *JSONRPCHandler) removeRemoteStreamSub(sessionID string, connState *rpc.Connection) bool {
	h.remoteStreamMu.Lock()
	defer h.remoteStreamMu.Unlock()
	subs := h.remoteStreamSubs[sessionID]
	if subs == nil {
		return false
	}
	delete(subs, connState)
	if len(subs) == 0 {
		delete(h.remoteStreamSubs, sessionID)
		return true
	}
	return false
}

func (h *JSONRPCHandler) removeRemoteStreamSubsForConn(connState *rpc.Connection) []string {
	h.remoteStreamMu.Lock()
	defer h.remoteStreamMu.Unlock()
	var emptied []string
	for sessionID, subs := range h.remoteStreamSubs {
		if _, ok := subs[connState]; !ok {
			continue
		}
		delete(subs, connState)
		if len(subs) == 0 {
			delete(h.remoteStreamSubs, sessionID)
			emptied = append(emptied, sessionID)
		}
	}
	return emptied
}

func (h *JSONRPCHandler) remoteStreamTargets(sessionID string) []*rpc.Connection {
	h.remoteStreamMu.Lock()
	defer h.remoteStreamMu.Unlock()
	subs := h.remoteStreamSubs[sessionID]
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
func (h *JSONRPCHandler) remoteSubscribe(connState *rpc.Connection, req rpc.TerminalRemoteSubscribeParams) (any, error) {
	firstSub := h.addRemoteStreamSub(req.SessionID, connState)
	connState.AddCloseHook(func() {
		for _, sessionID := range h.removeRemoteStreamSubsForConn(connState) {
			_, _ = h.remoteUnsubscribe(connState, rpc.TerminalRemoteUnsubscribeParams{SessionID: sessionID})
		}
	})
	if !firstSub {
		return map[string]bool{"ok": true}, nil
	}
	if err := h.relayClient.SendNotification(relay.MethodTerminalStreamRequest, map[string]string{
		"sessionId": req.SessionID,
		"ownerNode": req.OwnerNode,
		"fromNode":  h.nodeID,
	}); err != nil {
		h.removeRemoteStreamSub(req.SessionID, connState)
		return nil, workspace.NewRPCError(rpcCodeServerError, err.Error())
	}
	return map[string]bool{"ok": true}, nil
}

// remoteUnsubscribe sends terminal.stream.cancel to the relay.
func (h *JSONRPCHandler) remoteUnsubscribe(connState *rpc.Connection, req rpc.TerminalRemoteUnsubscribeParams) (any, error) {
	if !h.removeRemoteStreamSub(req.SessionID, connState) {
		return map[string]bool{"ok": true}, nil
	}
	// Best-effort: the relay may be gone, in which case there is nothing to cancel.
	_ = h.relayClient.SendNotification(relay.MethodTerminalStreamCancel, map[string]string{
		"sessionId": req.SessionID,
		"fromNode":  h.nodeID,
	})
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) forwardRemoteTerminalOutput(sessionID string, payload []byte) bool {
	targets := h.remoteStreamTargets(sessionID)
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

func (h *JSONRPCHandler) forwardRemoteTerminalInput(sessionID string, payload []byte) bool {
	if len(h.remoteStreamTargets(sessionID)) == 0 {
		return false
	}
	if err := h.relayClient.SendBinary(payload); err != nil {
		log.Warn().Err(err).Str("sessionId", sessionID).Msg("remote terminal input forward failed")
		return false
	}
	return true
}

// HandleRelayMessage implements relay.MessageHandler for the relay-level
// messages the relay client does not own: job dispatch, workspace snapshot
// changes, and terminal session/stream notifications.
func (h *JSONRPCHandler) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodJobRun:
		handleJobRun(h.runtime, connState, nodeID, params)
		return true
	case relay.MethodWorkspaceSnapshotChanged:
		publishWorkspaceSnapshotChanged(h, params)
		return true
	case relay.MethodTerminalSessionChanged:
		publishTerminalSessionChanged(h, params)
		return true
	case relay.MethodTerminalStreamRequest:
		handleTerminalStreamRequest(h, connState, params)
		return true
	case relay.MethodTerminalStreamAccept:
		publishTerminalStreamAccept(h, params)
		return true
	case relay.MethodTerminalStreamCancel:
		publishTerminalStreamCancel(h, params)
		return true
	default:
		return false
	}
}

// handleTerminalStreamRequest is called on the owning daemon (daemon A) when
// another node wants to subscribe to a PTY session. It subscribes the relay
// connState to the local terminal session so output flows back over /ws.
func handleTerminalStreamRequest(handler *JSONRPCHandler, connState *rpc.Connection, params json.RawMessage) {
	var p struct {
		SessionID string `json:"sessionId"`
		FromNode  string `json:"fromNode"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		log.Warn().Err(err).Msg("relay: invalid terminal.stream.request params")
		return
	}

	subscription, err := handler.manager.Terminals().Subscribe(workspace.TerminalSubscribeRequest{SessionID: p.SessionID})
	if err != nil {
		log.Warn().Err(err).Str("sessionId", p.SessionID).Msg("relay: terminal.stream.request subscribe failed")
		return
	}
	connState.AttachSubscription(p.SessionID, subscription.ID, subscription.Events, func(sessionID string, subscriptionID uint64) {
		_, _ = handler.manager.Terminals().Unsubscribe(workspace.TerminalUnsubscribeRequest{SessionID: sessionID, SubscriptionID: subscriptionID})
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
func publishTerminalStreamAccept(handler *JSONRPCHandler, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.accept params")
			return
		}
	}
	handler.events.Publish(frontendEvent{Topic: "terminalStreamAccepted", Payload: payload})
}

// publishTerminalStreamCancel notifies the desktop that a remote stream was cancelled.
func publishTerminalStreamCancel(handler *JSONRPCHandler, params json.RawMessage) {
	var payload map[string]any
	if len(params) > 0 {
		if err := json.Unmarshal(params, &payload); err != nil {
			log.Warn().Err(err).Msg("relay: invalid terminal.stream.cancel params")
			return
		}
	}
	handler.events.Publish(frontendEvent{Topic: "terminalStreamCancelled", Payload: payload})
}
