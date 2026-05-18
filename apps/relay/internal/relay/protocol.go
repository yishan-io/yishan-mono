package relay

import "encoding/json"

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 wire types
// ---------------------------------------------------------------------------

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type response struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id"`
	Result  any       `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
}

type notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// ---------------------------------------------------------------------------
// Relay protocol methods
// ---------------------------------------------------------------------------

const (
	// Server -> Node
	MethodPing   = "relay.ping"
	MethodJobRun = "job.run"

	// Node -> Server
	MethodPong      = "relay.pong"
	MethodJobAck    = "job.ack"
	MethodJobResult = "job.result"
)

// ---------------------------------------------------------------------------
// JSON-RPC error codes
// ---------------------------------------------------------------------------

const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603

	CodeAuthFailed       = -32001
	CodeNodeOffline      = -32002
	CodeDispatchRejected = -32003
)

// ---------------------------------------------------------------------------
// job.run params (server -> node)
// ---------------------------------------------------------------------------

type jobRunParams struct {
	RunID          string         `json:"runId"`
	JobID          string         `json:"jobId"`
	ScheduledFor   string         `json:"scheduledFor"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Payload        map[string]any `json:"payload"`
}

// ---------------------------------------------------------------------------
// job.ack params (node -> server)
// ---------------------------------------------------------------------------

type jobAckParams struct {
	RunID  string `json:"runId"`
	Status string `json:"status"` // "accepted" | "rejected"
	Reason string `json:"reason,omitempty"`
}

// ---------------------------------------------------------------------------
// job.result params (node -> server)
// ---------------------------------------------------------------------------

type jobResultParams struct {
	RunID      string         `json:"runId"`
	Status     string         `json:"status"` // "completed" | "failed" | "cancelled"
	Output     map[string]any `json:"output,omitempty"`
	Error      *jobError      `json:"error,omitempty"`
	DurationMs int64          `json:"durationMs,omitempty"`
}

type jobError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
