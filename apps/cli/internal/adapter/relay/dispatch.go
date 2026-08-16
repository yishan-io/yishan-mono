package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/rpc"
)

// dispatchVerdict is the relay's routing answer for a targeted workspace
// create/close envelope sent as a JSON-RPC request.
type dispatchVerdict struct {
	accepted bool
	reason   string
}

// dispatchTimeout bounds how long the origin waits for the relay's routing
// verdict. Older relays do not answer requests, so a timeout falls back to the
// legacy fire-and-forget behavior instead of failing the dispatch.
const dispatchTimeout = 5 * time.Second

// dispatchSeq is a monotonic counter for dispatch request ids; combined with
// the target node id it makes ids unique even for rapid same-target sends.
var dispatchSeq uint64

// SendDispatchRequest sends a workspace create/close envelope to the relay as
// a JSON-RPC request and waits for the relay's routing verdict. Returns an
// error when the relay reports the target node offline (the close/create is
// NOT allowed); on timeout it falls back to the legacy fire-and-forget behavior
// so older relays never regress the working path.
func (c *Client) SendDispatchRequest(payload any, targetNodeID string) error {
	id := fmt.Sprintf("dispatch-%s-%d", targetNodeID, atomic.AddUint64(&dispatchSeq, 1))
	verdictCh := c.registerRequest(id)
	defer c.discardRequest(id) // no-op once resolveRequest deleted the key

	conn := c.conn
	if conn == nil {
		return fmt.Errorf("relay not connected")
	}

	rawParams, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("relay marshal failed: %w", err)
	}

	msg := rpc.Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(fmt.Sprintf("%q", id)),
		Method:  MethodWorkspaceSnapshotChanged,
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
	case <-time.After(dispatchTimeout):
		// Legacy relay (no verdict support) or a lost/delayed response. We
		// cannot distinguish the two: a legacy relay broadcast unconditionally
		// (offline target silently dropped — the pre-guard behavior), while a
		// new relay that lost the response may have delivered the dispatch.
		// Falling back to fire-and-forget keeps legacy relays working; the
		// warning makes timeouts on new relays detectable.
		log.Warn().
			Str("targetNodeId", targetNodeID).
			Dur("timeout", dispatchTimeout).
			Msg("relay dispatch verdict timed out; falling back to fire-and-forget (legacy relay or lost response)")
		return nil
	}
}

// handleDispatchResponse resolves a pending dispatch request with the relay's
// routing verdict. Only ids with the "dispatch-" prefix are consumed; anything
// else (future relay responses such as job-dispatch acks) falls through to the
// rpc server instead of being swallowed.
func (c *Client) handleDispatchResponse(id json.RawMessage, result json.RawMessage) bool {
	var idStr string
	if err := json.Unmarshal(id, &idStr); err != nil || !strings.HasPrefix(idStr, "dispatch-") {
		return false
	}
	var res struct {
		Accepted *bool  `json:"accepted"`
		Reason   string `json:"reason"`
	}
	if err := json.Unmarshal(result, &res); err != nil {
		res = struct {
			Accepted *bool  `json:"accepted"`
			Reason   string `json:"reason"`
		}{}
	}
	accepted := res.Accepted != nil && *res.Accepted
	c.resolveRequest(idStr, dispatchVerdict{accepted: accepted, reason: res.Reason})
	return true
}

// handleRelayMessage routes relay-protocol messages (heartbeat, job dispatch).
// Returns true if the message was consumed and should not be passed to the rpc
// server.
func (c *Client) handleRelayMessage(connState *rpc.Connection, payload []byte) bool {
	var msg struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params,omitempty"`
		ID     json.RawMessage `json:"id,omitempty"`
		Result json.RawMessage `json:"result,omitempty"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return false
	}

	// A JSON-RPC response (id present, no method) answers a pending relay
	// dispatch request (workspace create/close routing verdict).
	if len(msg.ID) > 0 && msg.Method == "" {
		return c.handleDispatchResponse(msg.ID, msg.Result)
	}

	switch msg.Method {
	case MethodPing:
		_ = connState.WriteJSON(rpc.Notification{JSONRPC: "2.0", Method: MethodPong})
		return true
	default:
		if c.handler != nil {
			return c.handler.HandleRelayMessage(context.Background(), connState, c.nodeID, msg.Method, msg.Params)
		}
		return false
	}
}

// registerRequest registers a pending routing verdict keyed by request id.
func (c *Client) registerRequest(id string) chan dispatchVerdict {
	ch := make(chan dispatchVerdict, 1)
	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()
	return ch
}

func (c *Client) resolveRequest(id string, verdict dispatchVerdict) {
	c.pendingMu.Lock()
	ch := c.pending[id]
	delete(c.pending, id)
	c.pendingMu.Unlock()
	if ch != nil {
		ch <- verdict
	}
}

func (c *Client) discardRequest(id string) {
	c.pendingMu.Lock()
	delete(c.pending, id)
	c.pendingMu.Unlock()
}
