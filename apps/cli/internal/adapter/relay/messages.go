package relay

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpc"
)

// handleRelayMessage routes relay-protocol messages (heartbeat, then the
// message handler).
// Returns true if the message was consumed and should not be passed to the rpc
// server.
func (c *Client) handleRelayMessage(ctx context.Context, connState *rpc.Connection, payload []byte) bool {
	var msg struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params,omitempty"`
		ID     json.RawMessage `json:"id,omitempty"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return false
	}

	// JSON-RPC responses (id present, no method) are not relay messages;
	// they fall through to the rpc server.
	if len(msg.ID) > 0 && msg.Method == "" {
		return false
	}

	switch msg.Method {
	case MethodPing:
		_ = connState.WriteJSON(rpc.Notification{JSONRPC: "2.0", Method: MethodPong})
		return true
	default:
		if c.handler != nil {
			return c.handler.HandleRelayMessage(ctx, connState, c.nodeID, msg.Method, msg.Params)
		}
		return false
	}
}
