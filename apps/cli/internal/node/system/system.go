package system

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/rpc"

	"github.com/rs/zerolog/log"
)

// SystemService implementation: the daemon./app./agent./tokenUsage./node.
// RPC methods that fall through the namespace router to the system handler.

func (s *Service) DaemonPing() (any, error) {
	return map[string]string{"status": "ok"}, nil
}

func (s *Service) FrontendEventsStream(ctx context.Context, connection *rpc.Connection) (any, error) {
	subscriptionID, events := s.deps.Events.Subscribe()
	connection.AttachEventStream(events, rpc.MethodFrontendEventsStream, func() {
		s.deps.Events.Unsubscribe(subscriptionID)
	})
	return map[string]bool{"subscribed": true}, nil
}

func (s *Service) AgentListDetectionStatuses(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return ListAgentDetectionStatuses(refresh), nil
}

func (s *Service) CLIToolListStatuses(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return listCLIToolDetectionStatusesWithRefresh(refresh), nil
}

func (s *Service) CLIToolInstall(ctx context.Context, req rpc.SystemCLIToolInstallParams) (any, error) {
	toolID := strings.TrimSpace(req.ToolID)
	if toolID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "toolId is required")
	}
	status, err := installCLITool(ctx, toolID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "status": status}, nil
}

func (s *Service) CLIToolUninstall(ctx context.Context, req rpc.SystemCLIToolUninstallParams) (any, error) {
	toolID := strings.TrimSpace(req.ToolID)
	if toolID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "toolId is required")
	}
	status, err := uninstallCLITool(ctx, toolID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "status": status}, nil
}

func (s *Service) IntegrationGitHubStatus(ctx context.Context, params json.RawMessage) (any, error) {
	refresh, err := parseBoolRefreshParam(params)
	if err != nil {
		return nil, err
	}
	return getGitHubDetectionStatus(refresh), nil
}

func (s *Service) AppPersistAuthTokens(ctx context.Context, params json.RawMessage) (any, error) {
	var req cloud.TokenUpdate
	if err := rpc.DecodeParams(params, &req); err != nil {
		return nil, err
	}
	req.AccessToken = strings.TrimSpace(req.AccessToken)
	req.RefreshToken = strings.TrimSpace(req.RefreshToken)
	if req.AccessToken == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "accessToken is required")
	}
	if err := s.deps.Session.PersistAuthTokens(req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) AppGetAccessToken(ctx context.Context) (any, error) {
	accessToken, expiresAt, err := s.deps.Session.EnsureFreshAccessToken()
	if err != nil {
		return nil, err
	}
	result := map[string]string{"accessToken": accessToken}
	if expiresAt != "" {
		result["accessTokenExpiresAt"] = expiresAt
	}
	return result, nil
}

func (s *Service) AppCheckAuthStatus(ctx context.Context) (any, error) {
	authenticated, expiresAt, err := s.deps.Session.CheckAuthStatus()
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

func (s *Service) AppLogout(ctx context.Context) (any, error) {
	if err := s.deps.Session.ClearAuthState(); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) AppReloadAuthConfig(ctx context.Context) (any, error) {
	if err := s.deps.Session.ReloadAuthConfig(); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) AgentListModels(ctx context.Context, req rpc.SystemAgentListModelsParams) (any, error) {
	agentKind := strings.TrimSpace(req.AgentKind)
	if agentKind == "" {
		return s.deps.ModelList.ListAllModels(req.ForceRefresh), nil
	}
	return s.deps.ModelList.ListModels(agentKind, req.ForceRefresh)
}

func (s *Service) TokenUsageDebugState(ctx context.Context) (any, error) {
	if s.deps.TokenUsage == nil {
		return map[string]any{"enabled": false}, nil
	}
	return map[string]any{
		"enabled": true,
		"state":   s.deps.TokenUsage.DebugState(),
	}, nil
}

func (s *Service) ProjectList(ctx context.Context, req rpc.SystemProjectListParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "orgId is required")
	}
	client := s.deps.Session.APIClient()
	resp, err := client.ListProjects(orgID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	return resp.Projects, nil
}

func (s *Service) NodeList(ctx context.Context, req rpc.SystemNodeListParams) (any, error) {
	orgID := strings.TrimSpace(req.OrgID)
	if orgID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "orgId is required")
	}
	client := s.deps.Session.APIClient()
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
	if err := rpc.DecodeParams(params, &req); err != nil {
		return false, err
	}
	return req.Refresh, nil
}
