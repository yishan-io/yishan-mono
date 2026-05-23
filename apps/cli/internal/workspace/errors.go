package workspace

const (
	rpcCodeInvalidParams   = -32602
	rpcCodeNotFound        = -32004
	rpcCodePathRestricted  = -32003
	rpcCodeToolUnavailable = -32010
	rpcCodeSessionInactive = -32005
)

type RPCError struct {
	Code    int
	Message string
}

func (e *RPCError) Error() string {
	return e.Message
}

func NewRPCError(code int, message string) error {
	return &RPCError{Code: code, Message: message}
}
