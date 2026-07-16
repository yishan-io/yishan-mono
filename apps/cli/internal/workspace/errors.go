package workspace

import "yishan/apps/cli/internal/rpcerror"

const (
	rpcCodeInvalidParams   = rpcerror.CodeInvalidParams
	rpcCodeNotFound        = rpcerror.CodeNotFound
	rpcCodePathRestricted  = rpcerror.CodePathRestricted
	rpcCodeToolUnavailable = rpcerror.CodeToolUnavailable
	rpcCodeSessionInactive = rpcerror.CodeSessionInactive
)

type RPCError = rpcerror.Error

func NewRPCError(code int, message string) error {
	return rpcerror.NewRPCError(code, message)
}
