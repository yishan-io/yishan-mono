package daemon

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
)

// relayDispatchVerdict is the relay's routing answer for a targeted workspace
// create/close envelope sent as a JSON-RPC request.
type relayDispatchVerdict struct {
	accepted bool
	reason   string
}

// relayDispatchTimeout bounds how long the origin waits for the relay's routing
// verdict. Older relays do not answer requests, so a timeout falls back to the
// legacy fire-and-forget behavior instead of failing the dispatch.
const relayDispatchTimeout = 5 * time.Second

// registerRelayRequest registers a pending routing verdict keyed by request id.
func (h *JSONRPCHandler) registerRelayRequest(id string) chan relayDispatchVerdict {
	ch := make(chan relayDispatchVerdict, 1)
	h.relayPendingMu.Lock()
	h.relayPending[id] = ch
	h.relayPendingMu.Unlock()
	return ch
}

func (h *JSONRPCHandler) resolveRelayRequest(id string, verdict relayDispatchVerdict) {
	h.relayPendingMu.Lock()
	ch := h.relayPending[id]
	delete(h.relayPending, id)
	h.relayPendingMu.Unlock()
	if ch != nil {
		ch <- verdict
	}
}

func (h *JSONRPCHandler) discardRelayRequest(id string) {
	h.relayPendingMu.Lock()
	delete(h.relayPending, id)
	h.relayPendingMu.Unlock()
}

// sendRelayDispatchRequest sends a workspace create/close envelope to the relay
// as a JSON-RPC request and waits for the relay's routing verdict. Returns an
// error when the relay reports the target node offline (the close/create is NOT
// allowed); on timeout it falls back to the legacy fire-and-forget behavior so
// older relays never regress the working path.
func (h *JSONRPCHandler) sendRelayDispatchRequest(payload any, targetNodeID string) error {
	id := fmt.Sprintf("dispatch-%s-%d", targetNodeID, time.Now().UnixNano())
	verdictCh := h.registerRelayRequest(id)

	h.relayConnMu.RLock()
	conn := h.relayConn
	h.relayConnMu.RUnlock()
	if conn == nil {
		h.discardRelayRequest(id)
		return fmt.Errorf("relay not connected")
	}

	rawParams, err := json.Marshal(payload)
	if err != nil {
		h.discardRelayRequest(id)
		return fmt.Errorf("relay marshal failed: %w", err)
	}

	msg := request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(fmt.Sprintf("%q", id)),
		Method:  relayMethodWorkspaceSnapshotChanged,
		Params:  rawParams,
	}
	if err := conn.WriteJSON(msg); err != nil {
		h.discardRelayRequest(id)
		return fmt.Errorf("relay write failed: %w", err)
	}

	select {
	case verdict := <-verdictCh:
		if !verdict.accepted {
			log.Warn().Str("targetNodeId", targetNodeID).Str("reason", verdict.reason).Msg("relay dispatch rejected")
			return fmt.Errorf("workspace host %s is offline; cannot dispatch", targetNodeID)
		}
		return nil
	case <-time.After(relayDispatchTimeout):
		// Legacy relay (no response) — keep the pre-guard fire-and-forget behavior.
		return nil
	}
}
