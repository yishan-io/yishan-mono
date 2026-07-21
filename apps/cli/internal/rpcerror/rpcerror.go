package rpcerror

// JSON-RPC 2.0 reserved error codes plus project-specific server codes.
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
)

type Error struct {
	Code    int
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

func New(code int, message string) error {
	return &Error{Code: code, Message: message}
}

func NewRPCError(code int, message string) error {
	return New(code, message)
}

// CodeToExitCode maps stable string error codes to CLI exit codes.
func CodeToExitCode(code string) int {
	switch code {
	case "unauthenticated":
		return 3
	case "not_found":
		return 4
	case "permission_denied":
		return 5
	case "daemon_not_running":
		return 6
	case "server_error":
		return 7
	case "validation_error":
		return 2
	default:
		return 1
	}
}
