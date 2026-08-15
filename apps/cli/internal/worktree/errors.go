package worktree

// Domain errors for the worktree provisioning package. The worktree package
// never imports transport or RPC packages: it returns plain domain errors and
// the RPC layer (rpc.MapRPCError) maps them to wire errors.

// ErrorCode classifies worktree failures for the RPC mapping.
type ErrorCode string

const (
	ErrCodeInvalidParams   ErrorCode = "invalid_params"
	ErrCodeNotFound        ErrorCode = "not_found"
	ErrCodeToolUnavailable ErrorCode = "tool_unavailable"
)

// Error is the domain error returned by worktree operations.
type Error struct {
	Code    ErrorCode
	Message string
}

// Error implements error.
func (e *Error) Error() string { return e.Message }

// NewError builds a worktree domain error.
func NewError(code ErrorCode, message string) error {
	return &Error{Code: code, Message: message}
}
