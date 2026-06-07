package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/api"
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
		return listAgentDetectionStatuses(refresh), nil
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
		return getGitHubDetectionStatus(refresh), nil
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
		if err := h.runtime.PersistAuthTokens(req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodAppGetAccessToken:
		accessToken, expiresAt, err := h.runtime.EnsureFreshAccessToken()
		if err != nil {
			return nil, err
		}
		result := map[string]string{"accessToken": accessToken}
		if expiresAt != "" {
			result["accessTokenExpiresAt"] = expiresAt
		}
		return result, nil
	case MethodAppCheckAuthStatus:
		authenticated, expiresAt, err := h.runtime.CheckAuthStatus()
		if err != nil {
			return map[string]any{"authenticated": false}, nil
		}
		result := map[string]any{"authenticated": authenticated}
		if expiresAt != "" {
			result["accessTokenExpiresAt"] = expiresAt
		}
		return result, nil
	case MethodAppLogout:
		h.runtime.ClearAuthState()
		return map[string]bool{"ok": true}, nil
	case MethodAppReloadAuthConfig:
		if err := h.runtime.ReloadAuthConfig(); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodAgentListModels:
		type listModelsParams struct {
			AgentKind    string `json:"agentKind"`
			ForceRefresh bool   `json:"forceRefresh"`
		}
		var req listModelsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		agentKind := strings.TrimSpace(req.AgentKind)
		if agentKind == "" {
			return h.modelList.ListAllModels(req.ForceRefresh), nil
		}
		result, err := h.modelList.ListModels(agentKind, req.ForceRefresh)
		if err != nil {
			return nil, err
		}
		return result, nil
	case MethodTokenUsageDebugState:
		if h.tokenUsage == nil {
			return map[string]any{"enabled": false}, nil
		}
		return map[string]any{
			"enabled": true,
			"state":   h.tokenUsage.DebugState(),
		}, nil
	case MethodProjectList:
		var req struct {
			OrgID string `json:"orgId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		orgID := strings.TrimSpace(req.OrgID)
		if orgID == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "orgId is required")
		}
		client := h.runtime.APIClient()
		resp, err := client.ListProjects(orgID)
		if err != nil {
			return nil, fmt.Errorf("list projects: %w", err)
		}
		return resp.Projects, nil
	case MethodNodeList:
		var req struct {
			OrgID string `json:"orgId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		orgID := strings.TrimSpace(req.OrgID)
		if orgID == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "orgId is required")
		}
		client := h.runtime.APIClient()
		resp, err := client.ListNodes(orgID)
		if err != nil {
			return nil, fmt.Errorf("list nodes: %w", err)
		}
		return resp.Nodes, nil
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
