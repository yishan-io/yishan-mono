package daemon

import (
	"encoding/json"
	"errors"
	"time"

	"yishan/apps/cli/internal/computer"
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

func decodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return rpcerror.NewRPCError(rpcCodeInvalidParams, "missing params")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return rpcerror.NewRPCError(rpcCodeInvalidParams, "invalid params")
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
	var e *rpcerror.Error
	if errors.As(err, &e) {
		return &rpcError{Code: e.Code, Message: e.Message}
	}
	var computerErr *computer.Error
	if errors.As(err, &computerErr) {
		return &rpcError{
			Code:    rpcCodeServerError,
			Message: computerErr.Message,
			Data: map[string]any{
				"code":      computerErr.Code,
				"details":   computerErr.Details,
				"retryable": computerErr.Retryable,
			},
		}
	}
	return &rpcError{Code: rpcCodeServerError, Message: err.Error()}
}

func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
