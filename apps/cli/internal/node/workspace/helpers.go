package workspace

import (
	"time"

	"yishan/apps/cli/internal/rpc"
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
