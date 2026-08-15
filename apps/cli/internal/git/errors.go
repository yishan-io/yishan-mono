package git

// Domain errors for the git service boundary. The git service never imports
// transport or RPC packages: it returns plain domain errors and the RPC layer
// (node services / rpc.MapRPCError) maps them to wire errors.

// ErrorCode classifies git-service failures for the RPC mapping.
type ErrorCode string

const (
	ErrCodeInvalidParams   ErrorCode = "invalid_params"
	ErrCodeNotFound        ErrorCode = "not_found"
	ErrCodeToolUnavailable ErrorCode = "tool_unavailable"
)

// Error is the domain error returned by git operations.
type Error struct {
	Code    ErrorCode
	Message string
}

// Error implements error.
func (e *Error) Error() string { return e.Message }

// NewError builds a git-service domain error.
func NewError(code ErrorCode, message string) error {
	return &Error{Code: code, Message: message}
}
