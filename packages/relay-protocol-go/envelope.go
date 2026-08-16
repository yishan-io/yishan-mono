// Package relayprotocol owns the wire protocol shared by the CLI daemon
// (apps/cli) and the relay server (apps/relay): JSON-RPC 2.0 envelopes,
// relay method constants, job-run messages, terminal stream messages,
// workspace snapshot routing, and the binary PTY frame format.
//
// The module contains wire types, protocol constants, encoding helpers, and
// compatibility tests only. Connection state, reconnect behavior, token
// acquisition, and event publication stay in each application.
package relayprotocol

import "encoding/json"

// Request is a JSON-RPC 2.0 request envelope.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is a JSON-RPC 2.0 response envelope.
type Response struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *RPCError `json:"error,omitempty"`
}

// Notification is a server-initiated JSON-RPC 2.0 notification (no id).
type Notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// RPCError is a JSON-RPC 2.0 error object.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}
