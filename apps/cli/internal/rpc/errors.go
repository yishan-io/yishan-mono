package rpc

// JSON-RPC 2.0 reserved error codes plus project-specific server codes. The
// transport owns the wire codes: domain and capability packages return their
// own errors and MapRPCError maps them here.
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeServerError    = -32000

	CodeSessionExists   = -32003
	CodePathRestricted  = -32003
	CodeNotFound        = -32004
	CodeSessionInactive = -32005
	CodeToolUnavailable = -32010

	// ErrorDataCodeDSHRuntimeUnavailable identifies DSH lifecycle failures.
	ErrorDataCodeDSHRuntimeUnavailable = "DSH_RUNTIME_UNAVAILABLE"
	// ErrorDataCodeDSHTranscriptProtocolUnavailable identifies unsupported renderer transcript contracts.
	ErrorDataCodeDSHTranscriptProtocolUnavailable = "DSH_TRANSCRIPT_PROTOCOL_UNAVAILABLE"
)

// Error is a structured RPC error that carries a wire error code. Handlers
// and application-boundary services build it with NewRPCError; MapRPCError
// converts it to the wire RPCError object.
type Error struct {
	Code    int
	Message string
	Data    map[string]any
}

// Error implements error.
func (e *Error) Error() string { return e.Message }

// NewRPCError builds a structured RPC error for handler and service use.
func NewRPCError(code int, message string) error {
	return &Error{Code: code, Message: message}
}

// NewRPCErrorWithData builds a structured RPC error with stable wire data.
func NewRPCErrorWithData(code int, message string, data map[string]any) error {
	return &Error{Code: code, Message: message, Data: data}
}
