package relay

import (
	"encoding/json"

	"yishan/apps/cli/internal/rpc"
)

// handleRelayMessage answers relay heartbeat pings. Returns true if the message was consumed and should not be passed to the rpc
// server.
func (*Client) handleRelayMessage(connState *rpc.Connection, payload []byte) bool {
	var msg struct {
		Method string          `json:"method"`
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

	if msg.Method != MethodPing {
		return false
	}
	_ = connState.WriteJSON(rpc.Notification{JSONRPC: "2.0", Method: MethodPong})
	return true
}
