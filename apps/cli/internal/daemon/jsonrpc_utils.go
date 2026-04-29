package daemon

import (
	"encoding/json"
	"errors"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"
)

func decodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return workspace.NewRPCError(-32602, "missing params")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return workspace.NewRPCError(-32602, "invalid params")
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
	return &rpcError{Code: -32000, Message: err.Error()}
}
