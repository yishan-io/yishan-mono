// Package rpc owns the daemon's JSON-RPC transport: protocol types, WebSocket
// connection state, request concurrency limits, event subscriptions, binary
// terminal frames, and namespace routing. It does not import workspace,
// memory, usage, or agent implementations — the daemon composes the transport
// around its service graph.
package rpc

import (
	"encoding/json"
	"errors"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/rpcerror"
)

// JSON-RPC error codes (JSON-RPC 2.0 + application-specific).
const (
	CodeParseError     = rpcerror.CodeParseError
	CodeInvalidRequest = rpcerror.CodeInvalidRequest
	CodeMethodNotFound = rpcerror.CodeMethodNotFound
	CodeInvalidParams  = rpcerror.CodeInvalidParams
	CodeServerError    = rpcerror.CodeServerError
	CodeSessionExists  = rpcerror.CodeSessionExists
	CodeNotFound       = rpcerror.CodeNotFound
)

// Request is a JSON-RPC 2.0 request envelope.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is a JSON-RPC 2.0 response envelope.
type Response struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *RPCError `json:"error,omitempty"`
}

// Notification is a server-initiated JSON-RPC 2.0 notification (no id).
type Notification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// RPCError is a JSON-RPC 2.0 error object.
type RPCError struct {
	Code    int            `json:"code"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data,omitempty"`
}

// DecodeParams unmarshals raw params into out, mapping empty/invalid input to
// an invalid-params RPC error.
func DecodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return rpcerror.NewRPCError(CodeInvalidParams, "missing params")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return rpcerror.NewRPCError(CodeInvalidParams, "invalid params")
	}
	return nil
}

// AsJSONID decodes a raw JSON id into a JSON-encodable value.
func AsJSONID(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	var id any
	if err := json.Unmarshal(raw, &id); err != nil {
		return nil
	}
	return id
}

// MapRPCError converts a handler error into an RPC error object. Structured
// rpcerror values pass through; computer-use errors keep their structured
// code/details/retryable data; anything else becomes a generic server error.
func MapRPCError(err error) *RPCError {
	var e *rpcerror.Error
	if errors.As(err, &e) {
		return &RPCError{Code: e.Code, Message: e.Message}
	}
	var computerErr *computer.Error
	if errors.As(err, &computerErr) {
		return &RPCError{
			Code:    CodeServerError,
			Message: computerErr.Message,
			Data: map[string]any{
				"code":      computerErr.Code,
				"details":   computerErr.Details,
				"retryable": computerErr.Retryable,
			},
		}
	}
	var filesErr *files.Error
	if errors.As(err, &filesErr) {
		return &RPCError{Code: mapFileErrorCode(filesErr.Code), Message: filesErr.Message}
	}
	var gitErr *git.Error
	if errors.As(err, &gitErr) {
		return &RPCError{Code: mapGitErrorCode(gitErr.Code), Message: gitErr.Message}
	}
	return &RPCError{Code: CodeServerError, Message: err.Error()}
}

// mapFileErrorCode maps a file-service domain error code to the wire error
// code. The wire mapping is explicit here so the capability package never
// imports rpc/transport types.
func mapFileErrorCode(code files.ErrorCode) int {
	switch code {
	case files.ErrCodeInvalidParams:
		return rpcerror.CodeInvalidParams
	case files.ErrCodeNotFound:
		return rpcerror.CodeNotFound
	case files.ErrCodePathRestricted:
		return rpcerror.CodePathRestricted
	default:
		return rpcerror.CodeServerError
	}
}

// mapGitErrorCode maps a git-service domain error code to the wire error code.
func mapGitErrorCode(code git.ErrorCode) int {
	switch code {
	case git.ErrCodeInvalidParams:
		return rpcerror.CodeInvalidParams
	case git.ErrCodeNotFound:
		return rpcerror.CodeNotFound
	case git.ErrCodeToolUnavailable:
		return rpcerror.CodeToolUnavailable
	default:
		return rpcerror.CodeServerError
	}
}
