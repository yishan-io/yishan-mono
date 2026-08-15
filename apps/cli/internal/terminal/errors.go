package terminal

// Domain errors for the terminal service. The terminal package never imports
// transport or RPC packages: it returns plain domain errors and the RPC layer
// (rpc.MapRPCError) maps them to wire errors.

// ErrorCode classifies terminal failures for the RPC mapping.
type ErrorCode string

const (
	ErrCodeInvalidParams   ErrorCode = "invalid_params"
	ErrCodeNotFound        ErrorCode = "not_found"
	ErrCodeSessionInactive ErrorCode = "session_inactive"
)

// Error is the domain error returned by terminal operations.
type Error struct {
	Code    ErrorCode
	Message string
}

// Error implements error.
func (e *Error) Error() string { return e.Message }

// NewError builds a terminal domain error.
func NewError(code ErrorCode, message string) error {
	return &Error{Code: code, Message: message}
}
