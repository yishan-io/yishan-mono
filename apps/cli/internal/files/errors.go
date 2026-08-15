package files

import "yishan/apps/cli/internal/rpcerror"

// Error codes and helpers for the file service boundary. RPC errors produced
// here surface through the daemon's transport error mapping.
const (
	rpcCodeInvalidParams  = rpcerror.CodeInvalidParams
	rpcCodePathRestricted = rpcerror.CodePathRestricted
	rpcCodeNotFound       = rpcerror.CodeNotFound
)

// NewRPCError builds an RPC error.
func NewRPCError(code int, message string) error {
	return rpcerror.NewRPCError(code, message)
}

// RPCError is the RPC error type surfaced from file-service errors.
type RPCError = rpcerror.Error
