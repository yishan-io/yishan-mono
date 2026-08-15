package workspace

import "yishan/apps/cli/internal/rpcerror"

const (
	rpcCodeInvalidParams   = rpcerror.CodeInvalidParams
	rpcCodeNotFound        = rpcerror.CodeNotFound
	rpcCodePathRestricted  = rpcerror.CodePathRestricted
	rpcCodeToolUnavailable = rpcerror.CodeToolUnavailable
	rpcCodeSessionInactive = rpcerror.CodeSessionInactive
)

// Exported RPC error codes for packages that build workspace errors at a
// boundary (e.g. the instance registry).
const (
	RPCErrorCodeInvalidParams   = rpcCodeInvalidParams
	RPCErrorCodeNotFound        = rpcCodeNotFound
	RPCErrorCodePathRestricted  = rpcCodePathRestricted
	RPCErrorCodeToolUnavailable = rpcCodeToolUnavailable
	RPCErrorCodeSessionInactive = rpcCodeSessionInactive
)

type RPCError = rpcerror.Error

func NewRPCError(code int, message string) error {
	return rpcerror.NewRPCError(code, message)
}
