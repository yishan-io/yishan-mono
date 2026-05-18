package daemon

import (
	"encoding/json"
	"errors"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"
)

// JSON-RPC 2.0 reserved error codes.
const (
	rpcCodeParseError     = -32700
	rpcCodeInvalidRequest = -32600
	rpcCodeMethodNotFound = -32601
	rpcCodeInvalidParams  = -32602
	rpcCodeServerError    = -32000
	rpcCodeNotFound       = -32004
)

func decodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return workspace.NewRPCError(rpcCodeInvalidParams, "missing params")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return workspace.NewRPCError(rpcCodeInvalidParams, "invalid params")
	}
	return nil
}

func asJSONID(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var id any
	if err := json.Unmarshal(raw, &id); err != nil {
		return nil
	}
	return id
}

func mapRPCError(err error) *rpcError {
	var e *workspace.RPCError
	if errors.As(err, &e) {
		return &rpcError{Code: e.Code, Message: e.Message}
	}
	var terminalError *terminal.RPCError
	if errors.As(err, &terminalError) {
		return &rpcError{Code: terminalError.Code, Message: terminalError.Message}
	}
	return &rpcError{Code: rpcCodeServerError, Message: err.Error()}
}
