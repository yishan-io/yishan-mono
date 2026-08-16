package relayprotocol

// JSON-RPC 2.0 standard error codes.
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// Relay-specific JSON-RPC error codes.
const (
	CodeAuthFailed       = -32001
	CodeNodeOffline      = -32002
	CodeDispatchRejected = -32003
)
