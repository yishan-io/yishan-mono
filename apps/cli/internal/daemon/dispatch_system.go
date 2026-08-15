package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

// SystemService implementation: the daemon./app./agent./tokenUsage./node.
// RPC methods that fall through the namespace router to the system handler.

func (h *JSONRPCHandler) SystemDaemonPing() (any, error) {
	return map[string]string{"status": "ok"}, nil
}

func (h *JSONRPCHandler) SystemFrontendEventsStream(ctx context.Context, connection *rpc.Connection) (any, error) {
	subscriptionID, events := h.events.Subscribe()
	connection.AttachEventStream(events, MethodFrontendEventsStream, func() {
		h.events.Unsubscribe(subscriptionID)
	})
	return map[string]bool{"subscribed": true}, nil
}

func (h *JSONRPCHandler) SystemAgentListDetectionStatuses(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return listAgentDetectionStatuses(refresh), nil
}

func (h *JSONRPCHandler) SystemCLIToolListStatuses(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return ListCLIToolDetectionStatusesWithRefresh(refresh), nil
}

func (h *JSONRPCHandler) SystemCLIToolInstall(ctx context.Context, req rpc.SystemCLIToolInstallParams) (any, error) {
	toolID := strings.TrimSpace(req.ToolID)
	if toolID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "toolId is required")
	}
	status, err := installCLITool(ctx, toolID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "status": status}, nil
}

func (h *JSONRPCHandler) SystemCLIToolUninstall(ctx context.Context, req rpc.SystemCLIToolUninstallParams) (any, error) {
	toolID := strings.TrimSpace(req.ToolID)
	if toolID == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "toolId is required")
	}
	status, err := uninstallCLITool(ctx, toolID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "status": status}, nil
}

func (h *JSONRPCHandler) SystemIntegrationGitHubStatus(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return getGitHubDetectionStatus(refresh), nil
}

func (h *JSONRPCHandler) SystemAppPersistAuthTokens(ctx context.Context, params json.RawMessage) (any, error) {
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
}

func (h *JSONRPCHandler) SystemAppGetAccessToken(ctx context.Context) (any, error) {
	accessToken, expiresAt, err := h.runtime.EnsureFreshAccessToken()
	if err != nil {
		return nil, err
	}
	result := map[string]string{"accessToken": accessToken}
	if expiresAt != "" {
		result["accessTokenExpiresAt"] = expiresAt
	}
	return result, nil
}

func (h *JSONRPCHandler) SystemAppCheckAuthStatus(ctx context.Context) (any, error) {
	authenticated, expiresAt, err := h.runtime.CheckAuthStatus()
	if err != nil {
		log.Warn().Err(err).Msg("failed to check authentication status")
		return map[string]any{"authenticated": false}, nil
	}
	result := map[string]any{"authenticated": authenticated}
	if expiresAt != "" {
		result["accessTokenExpiresAt"] = expiresAt
	}
	return result, nil
}

func (h *JSONRPCHandler) SystemAppLogout(ctx context.Context) (any, error) {
	if err := h.runtime.ClearAuthState(); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) SystemAppReloadAuthConfig(ctx context.Context) (any, error) {
	if err := h.runtime.ReloadAuthConfig(); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) SystemAgentListModels(ctx context.Context, req rpc.SystemAgentListModelsParams) (any, error) {
	agentKind := strings.TrimSpace(req.AgentKind)
	if agentKind == "" {
		return h.modelList.ListAllModels(req.ForceRefresh), nil
	}
	return h.modelList.ListModels(agentKind, req.ForceRefresh)
}

func (h *JSONRPCHandler) SystemTokenUsageDebugState(ctx context.Context) (any, error) {
	if h.tokenUsage == nil {
		return map[string]any{"enabled": false}, nil
	}
	return map[string]any{
		"enabled": true,
		"state":   h.tokenUsage.DebugState(),
	}, nil
}

func (h *JSONRPCHandler) SystemProjectList(ctx context.Context, req rpc.SystemProjectListParams) (any, error) {
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
}

func (h *JSONRPCHandler) SystemNodeList(ctx context.Context, req rpc.SystemNodeListParams) (any, error) {
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
