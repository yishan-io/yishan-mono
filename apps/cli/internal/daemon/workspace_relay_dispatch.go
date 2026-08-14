package daemon

import (
	"encoding/json"
	"fmt"
	"sync/atomic"
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

// relayDispatchSeq is a monotonic counter for dispatch request ids; combined
// with the target node id it makes ids unique even for rapid same-target sends.
var relayDispatchSeq uint64

// sendRelayDispatchRequest sends a workspace create/close envelope to the relay
// as a JSON-RPC request and waits for the relay's routing verdict. Returns an
// error when the relay reports the target node offline (the close/create is NOT
// allowed); on timeout it falls back to the legacy fire-and-forget behavior so
// older relays never regress the working path.
func (h *JSONRPCHandler) sendRelayDispatchRequest(payload any, targetNodeID string) error {
	id := fmt.Sprintf("dispatch-%s-%d", targetNodeID, atomic.AddUint64(&relayDispatchSeq, 1))
	verdictCh := h.registerRelayRequest(id)
	defer h.discardRelayRequest(id) // no-op once resolveRelayRequest deleted the key

	h.relayConnMu.RLock()
	conn := h.relayConn
	h.relayConnMu.RUnlock()
	if conn == nil {
		return fmt.Errorf("relay not connected")
	}

	rawParams, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("relay marshal failed: %w", err)
	}

	msg := request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(fmt.Sprintf("%q", id)),
		Method:  relayMethodWorkspaceSnapshotChanged,
		Params:  rawParams,
	}
	if err := conn.WriteJSON(msg); err != nil {
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
		// Legacy relay (no verdict support) or a lost/delayed response. We
		// cannot distinguish the two: a legacy relay broadcast unconditionally
		// (offline target silently dropped — the pre-guard behavior), while a
		// new relay that lost the response may have delivered the dispatch.
		// Falling back to fire-and-forget keeps legacy relays working; the
		// warning makes timeouts on new relays detectable.
		log.Warn().
			Str("targetNodeId", targetNodeID).
			Dur("timeout", relayDispatchTimeout).
			Msg("relay dispatch verdict timed out; falling back to fire-and-forget (legacy relay or lost response)")
		return nil
	}
}
