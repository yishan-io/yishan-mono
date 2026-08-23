// Package rpc owns the daemon's JSON-RPC transport: protocol types, WebSocket
// connection state, request concurrency limits, event subscriptions, binary
// terminal frames, and namespace routing. It does not import workspace,
// memory, usage, or agent implementations — the daemon composes the transport
// around its service graph.
package rpc

import (
	"encoding/json"
	"errors"

	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/worktree"
)

// Wire envelope types live in the shared relay protocol module so the daemon
// and the relay server encode one JSON-RPC shape. rpc keeps the exported
// names its consumers use.

// Request is a JSON-RPC 2.0 request envelope.
type Request = relayprotocol.Request

// Response is a JSON-RPC 2.0 response envelope.
type response = relayprotocol.Response

// Notification is a server-initiated JSON-RPC 2.0 notification (no id).
type Notification = relayprotocol.Notification

// RPCError is a JSON-RPC 2.0 error object.
type RPCError = relayprotocol.RPCError

// DecodeParams unmarshals raw params into out, mapping empty/invalid input to
// an invalid-params RPC error.
func DecodeParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return NewRPCError(CodeInvalidParams, "missing params")
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return NewRPCError(CodeInvalidParams, "invalid params")
	}
	return nil
}

// asJSONID decodes a raw JSON id into a JSON-encodable value.
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

// MapRPCError converts a handler error into an RPC error object. Structured
// rpc.Error values pass through; computer-use errors keep their structured
// code/details/retryable data; anything else becomes a generic server error.
func MapRPCError(err error) *RPCError {
	var e *Error
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
	var worktreeErr *worktree.Error
	if errors.As(err, &worktreeErr) {
		return &RPCError{Code: mapWorktreeErrorCode(worktreeErr.Code), Message: worktreeErr.Message}
	}
	var terminalErr *terminal.Error
	if errors.As(err, &terminalErr) {
		return &RPCError{Code: mapTerminalErrorCode(terminalErr.Code), Message: terminalErr.Message}
	}
	var workspaceErr *workspace.Error
	if errors.As(err, &workspaceErr) {
		return &RPCError{Code: mapWorkspaceErrorCode(workspaceErr.Code), Message: workspaceErr.Message}
	}
	if code, isLocalTaskError := mapLocalTaskErrorCode(err); isLocalTaskError {
		return &RPCError{Code: code, Message: err.Error()}
	}
	return &RPCError{Code: CodeServerError, Message: err.Error()}
}

// mapFileErrorCode maps a file-service domain error code to the wire error
// code. The wire mapping is explicit here so the capability package never
// imports rpc/transport types.
func mapFileErrorCode(code files.ErrorCode) int {
	switch code {
	case files.ErrCodeInvalidParams:
		return CodeInvalidParams
	case files.ErrCodeNotFound:
		return CodeNotFound
	case files.ErrCodePathRestricted:
		return CodePathRestricted
	default:
		return CodeServerError
	}
}

// mapGitErrorCode maps a git-service domain error code to the wire error code.
func mapGitErrorCode(code git.ErrorCode) int {
	switch code {
	case git.ErrCodeInvalidParams:
		return CodeInvalidParams
	case git.ErrCodeNotFound:
		return CodeNotFound
	case git.ErrCodeToolUnavailable:
		return CodeToolUnavailable
	default:
		return CodeServerError
	}
}

// mapWorktreeErrorCode maps a worktree domain error code to the wire error code.
func mapWorktreeErrorCode(code worktree.ErrorCode) int {
	switch code {
	case worktree.ErrCodeInvalidParams:
		return CodeInvalidParams
	case worktree.ErrCodeNotFound:
		return CodeNotFound
	case worktree.ErrCodeToolUnavailable:
		return CodeToolUnavailable
	default:
		return CodeServerError
	}
}

// mapTerminalErrorCode maps a terminal domain error code to the wire error code.
func mapTerminalErrorCode(code terminal.ErrorCode) int {
	switch code {
	case terminal.ErrCodeInvalidParams:
		return CodeInvalidParams
	case terminal.ErrCodeNotFound:
		return CodeNotFound
	case terminal.ErrCodeSessionInactive:
		return CodeSessionInactive
	default:
		return CodeServerError
	}
}

// mapWorkspaceErrorCode maps a workspace domain error code to the wire error
// code. The mapping is explicit here so the workspace domain never imports
// transport or RPC types.
func mapWorkspaceErrorCode(code workspace.ErrorCode) int {
	switch code {
	case workspace.ErrCodeInvalidParams:
		return CodeInvalidParams
	case workspace.ErrCodeNotFound:
		return CodeNotFound
	case workspace.ErrCodePathRestricted:
		return CodePathRestricted
	case workspace.ErrCodeToolUnavailable:
		return CodeToolUnavailable
	case workspace.ErrCodeSessionInactive:
		return CodeSessionInactive
	default:
		return CodeServerError
	}
}

func mapLocalTaskErrorCode(err error) (int, bool) {
	switch {
	case errors.Is(err, localtask.ErrInvalidTask), errors.Is(err, localtask.ErrInvalidLink),
		errors.Is(err, localtask.ErrInvalidTagKey), errors.Is(err, localtask.ErrInvalidTagColor):
		return CodeInvalidParams, true
	case errors.Is(err, localtask.ErrTaskNotFound), errors.Is(err, localtask.ErrLinkNotFound),
		errors.Is(err, localtask.ErrContextUnavailable), errors.Is(err, localtask.ErrTagNotFound):
		return CodeNotFound, true
	default:
		return CodeServerError, false
	}
}
