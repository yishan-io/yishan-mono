package workspace

import "yishan/apps/cli/internal/rpcerror"

const (
	rpcCodeInvalidParams   = -32602
	rpcCodeNotFound        = -32004
	rpcCodePathRestricted  = -32003
	rpcCodeToolUnavailable = -32010
	rpcCodeSessionInactive = -32005
)

type RPCError = rpcerror.Error

func NewRPCError(code int, message string) error {
	return rpcerror.New(code, message)
}
