package files

// Domain errors for the file service boundary. The file service never imports
// transport or RPC packages: it returns plain domain errors and the RPC layer
// (node services / rpc.MapRPCError) maps them to wire errors.

// ErrorCode classifies file-service failures for the RPC mapping.
type ErrorCode string

const (
	ErrCodeInvalidParams  ErrorCode = "invalid_params"
	ErrCodePathRestricted ErrorCode = "path_restricted"
	ErrCodeNotFound       ErrorCode = "not_found"
)

// Error is the domain error returned by file operations.
type Error struct {
	Code    ErrorCode
	Message string
}

// Error implements error.
func (e *Error) Error() string { return e.Message }

// NewError builds a file-service domain error.
func NewError(code ErrorCode, message string) error {
	return &Error{Code: code, Message: message}
}
