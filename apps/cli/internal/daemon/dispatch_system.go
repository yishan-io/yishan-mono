package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/api"
	clidetector "yishan/apps/cli/internal/daemon/cli_detector"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchSystem(ctx context.Context, connState *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDaemonPing:
		return map[string]string{"status": "ok"}, nil
	case MethodFrontendEventsStream:
		subscriptionID, events := h.events.Subscribe()
		connState.AttachEventStream(events, func() {
			h.events.Unsubscribe(subscriptionID)
		})
		return map[string]bool{"subscribed": true}, nil
	case MethodAgentListDetectionStatuses:
		refresh, err := parseBoolRefreshParam(params)
		if err != nil {
			return nil, err
		}
		return clidetector.ListAgentCLIDetectionStatusesWithRefresh(refresh), nil
	case MethodCLIToolListStatuses:
		refresh, err := parseBoolRefreshParam(params)
		if err != nil {
			return nil, err
		}
		return ListCLIToolDetectionStatusesWithRefresh(refresh), nil
	case MethodIntegrationGitHubStatus:
		refresh, err := parseBoolRefreshParam(params)
		if err != nil {
			return nil, err
		}
		return clidetector.CheckGitHubConnectionStatus(refresh), nil
	case MethodAppPersistAuthTokens:
		var req api.TokenUpdate
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		req.AccessToken = strings.TrimSpace(req.AccessToken)
		req.RefreshToken = strings.TrimSpace(req.RefreshToken)
		if req.AccessToken == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "accessToken is required")
		}
		if err := cliruntime.PersistAuthTokens(req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodAppGetAccessToken:
		accessToken, expiresAt, err := cliruntime.EnsureFreshAccessToken()
		if err != nil {
			return nil, err
		}
		result := map[string]string{"accessToken": accessToken}
		if expiresAt != "" {
			result["accessTokenExpiresAt"] = expiresAt
		}
		return result, nil
	case MethodAppCheckAuthStatus:
		authenticated, expiresAt, err := cliruntime.CheckAuthStatus()
		if err != nil {
			return map[string]any{"authenticated": false}, nil
		}
		result := map[string]any{"authenticated": authenticated}
		if expiresAt != "" {
			result["accessTokenExpiresAt"] = expiresAt
		}
		return result, nil
	case MethodAppLogout:
		cliruntime.ClearAuthState()
		return map[string]bool{"ok": true}, nil
	case MethodAppReloadAuthConfig:
		if err := cliruntime.ReloadAuthConfig(); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

// parseBoolRefreshParam extracts the optional `refresh` boolean from a params object.
// Returns false when params is empty (the default for no-refresh calls).
func parseBoolRefreshParam(params json.RawMessage) (bool, error) {
	if len(params) == 0 {
		return false, nil
	}
	var req struct {
		Refresh bool `json:"refresh"`
	}
	if err := decodeParams(params, &req); err != nil {
		return false, err
	}
	return req.Refresh, nil
}
