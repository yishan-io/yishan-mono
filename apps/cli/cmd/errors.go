package cmd

import (
	"errors"
	"net/http"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/daemon"
)

// ClassifyError maps a command error to a short machine-readable code.
// The codes are intentionally stable strings that agents can match on.
func ClassifyError(err error) string {
	// Daemon sentinel
	if errors.Is(err, daemon.ErrNotRunning) {
		return "daemon_not_running"
	}

	// API errors — map HTTP status to a code
	var apiErr *api.APIError
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
	var refreshErr *api.TokenRefreshError
	if errors.As(err, &refreshErr) {
		return "unauthenticated"
	}

	return "error"
}
