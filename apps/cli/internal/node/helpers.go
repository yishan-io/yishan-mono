package node

import (
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
)

// nowRFC3339Nano formats the current UTC time in the wire protocol's timestamp
// shape.
func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

// mapRPCError delegates to the rpc package's error mapping.
func mapRPCError(err error) *rpc.RPCError {
	return rpc.MapRPCError(err)
}

// rpcerror aliases keep the moved service bodies compact; they are the wire
// error codes defined by the rpc protocol.
var (
	_ = rpcerror.CodeParseError
	_ = rpcerror.CodeInvalidRequest
	_ = rpcerror.CodeMethodNotFound
	_ = rpcerror.CodeInvalidParams
	_ = rpcerror.CodeServerError
	_ = rpcerror.CodeSessionExists
	_ = rpcerror.CodeNotFound
)
