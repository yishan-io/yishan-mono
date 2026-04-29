package terminal

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
