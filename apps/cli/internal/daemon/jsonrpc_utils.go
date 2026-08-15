package daemon

import (
	"encoding/json"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
)

const (
	rpcCodeParseError     = rpcerror.CodeParseError
	rpcCodeInvalidRequest = rpcerror.CodeInvalidRequest
	rpcCodeMethodNotFound = rpcerror.CodeMethodNotFound
	rpcCodeInvalidParams  = rpcerror.CodeInvalidParams
	rpcCodeServerError    = rpcerror.CodeServerError
	rpcCodeSessionExists  = rpcerror.CodeSessionExists
	rpcCodeNotFound       = rpcerror.CodeNotFound
)

// decodeParams delegates to the rpc package's param decoder.
func decodeParams(raw json.RawMessage, out any) error {
	return rpc.DecodeParams(raw, out)
}

// mapRPCError delegates to the rpc package's error mapping.
func mapRPCError(err error) *rpc.RPCError {
	return rpc.MapRPCError(err)
}

func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
