package cmd

import (
	"errors"
	"fmt"
	"net/http"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/rpc"
)

// ClassifyError maps a command error to a short machine-readable code.
// The codes are intentionally stable strings that agents can match on.
func ClassifyError(err error) string {
	if errors.Is(err, daemon.ErrNotRunning) {
		return "daemon_not_running"
	}
	for _, classify := range errorClassifiers {
		if code := classify(err); code != "" {
			return code
		}
	}
	return "error"
}

// errorClassifiers lists the classifier chain in priority order.
var errorClassifiers = []func(error) string{
	classifyRPCError,
	classifyMemoryError,
	classifyUsageError,
	classifyAPIError,
}

// usageError marks a command-argument failure so it maps to the usage exit code.
type usageError struct{ message string }

// Error implements error.
func (err *usageError) Error() string { return err.message }

// newUsageError builds one command-argument failure.
func newUsageError(format string, args ...any) error {
	return &usageError{message: fmt.Sprintf(format, args...)}
}

// classifyUsageError maps command-argument failures to the usage code.
func classifyUsageError(err error) string {
	var usageErr *usageError
	if errors.As(err, &usageErr) {
		return "validation_error"
	}
	return ""
}

// classifyRPCError maps the daemon JSON-RPC wire codes used by task calls.
func classifyRPCError(err error) string {
	var rpcErr *daemonclient.RPCError
	if !errors.As(err, &rpcErr) {
		return ""
	}
	switch rpcErr.Code {
	case rpc.CodeNotFound:
		return "not_found"
	case rpc.CodeInvalidParams:
		return "validation_error"
	case rpc.CodePathRestricted:
		return "permission_denied"
	case rpc.CodeServerError:
		return "server_error"
	default:
		return "error"
	}
}

// classifyMemoryError maps local memory file failures to CLI codes.
func classifyMemoryError(err error) string {
	switch {
	case errors.Is(err, memory.ErrMemoryFileNotFound):
		return "not_found"
	case errors.Is(err, memory.ErrUnsafeMemoryPath):
		return "permission_denied"
	case errors.Is(err, memory.ErrInvalidMemoryEntry):
		return "validation_error"
	default:
		return ""
	}
}

// classifyAPIError maps cloud API HTTP status and token-refresh failures to
// CLI codes.
func classifyAPIError(err error) string {
	var apiErr *cloud.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusBadRequest:
			return "validation_error"
		case http.StatusUnauthorized:
			return "unauthenticated"
		case http.StatusForbidden:
			return "permission_denied"
		case http.StatusNotFound:
			return "not_found"
		case http.StatusConflict:
			return "conflict"
		}
		if apiErr.StatusCode >= 500 {
			return "server_error"
		}
	}

	// Token refresh failure (wraps an API 401)
	var refreshErr *cloud.TokenRefreshError
	if errors.As(err, &refreshErr) {
		return "unauthenticated"
	}
	return ""
}
