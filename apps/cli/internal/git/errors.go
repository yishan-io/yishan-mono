package git

import "yishan/apps/cli/internal/rpcerror"

// Error codes and helpers for the git service boundary. RPC errors produced
// here surface through the daemon's transport error mapping.
const (
	rpcCodeInvalidParams   = rpcerror.CodeInvalidParams
	rpcCodeNotFound        = rpcerror.CodeNotFound
	rpcCodeToolUnavailable = rpcerror.CodeToolUnavailable
)

// NewRPCError builds an RPC error.
func NewRPCError(code int, message string) error {
	return rpcerror.NewRPCError(code, message)
}
