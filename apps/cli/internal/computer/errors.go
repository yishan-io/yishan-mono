package computer

type ErrorCode string

const (
	ErrorCodeUnavailable        ErrorCode = "unavailable"
	ErrorCodePermissionDenied   ErrorCode = "permission_denied"
	ErrorCodePermissionMissing  ErrorCode = "permission_missing"
	ErrorCodeTargetNotFound     ErrorCode = "target_not_found"
	ErrorCodeTargetChanged      ErrorCode = "target_changed"
	ErrorCodeUnsupportedAction  ErrorCode = "unsupported_action"
	ErrorCodeInvalidCoordinates ErrorCode = "invalid_coordinates"
	ErrorCodeApplicationBlocked ErrorCode = "application_blocked"
	ErrorCodeApprovalRequired   ErrorCode = "approval_required"
	ErrorCodeApprovalDenied     ErrorCode = "approval_denied"
	ErrorCodeTimeout            ErrorCode = "timeout"
	ErrorCodeCancelled          ErrorCode = "cancelled"
	ErrorCodeCaptureFailed      ErrorCode = "capture_failed"
	ErrorCodeNativeAPIFailed    ErrorCode = "native_api_failed"
	ErrorCodeRateLimited        ErrorCode = "rate_limited"
	ErrorCodeSensitiveTarget    ErrorCode = "sensitive_target"
	ErrorCodeInvalidArgument    ErrorCode = "invalid_argument"
)

type Error struct {
	Code      ErrorCode      `json:"code"`
	Message   string         `json:"message"`
	Details   map[string]any `json:"details,omitempty"`
	Retryable bool           `json:"retryable,omitempty"`
	Cause     error          `json:"-"`
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func NewError(code ErrorCode, message string) *Error {
	return &Error{Code: code, Message: message}
}

func NewErrorWithDetails(code ErrorCode, message string, details map[string]any, retryable bool) *Error {
	return &Error{Code: code, Message: message, Details: details, Retryable: retryable}
}
