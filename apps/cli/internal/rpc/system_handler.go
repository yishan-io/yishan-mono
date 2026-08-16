package rpc

import (
	"context"
	"encoding/json"
)

// SystemHandler owns the daemon./app./agent./tokenUsage./node./cliTools./
// integration. RPC methods that fall through the namespace router to system.
type SystemHandler struct {
	Services SystemService
}

// Call implements Handler.
func (h *SystemHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDaemonPing:
		return h.Services.DaemonPing()
	case MethodFrontendEventsStream:
		return h.Services.FrontendEventsStream(ctx, connection)
	case MethodAgentListDetectionStatuses:
		return h.Services.AgentListDetectionStatuses(ctx, params)
	case MethodCLIToolListStatuses:
		return h.Services.CLIToolListStatuses(ctx, params)
	case MethodCLIToolInstall:
		var req SystemCLIToolInstallParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CLIToolInstall(ctx, req)
	case MethodCLIToolUninstall:
		var req SystemCLIToolUninstallParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CLIToolUninstall(ctx, req)
	case MethodIntegrationGitHubStatus:
		return h.Services.IntegrationGitHubStatus(ctx, params)
	case MethodAppPersistAuthTokens:
		return h.Services.AppPersistAuthTokens(ctx, params)
	case MethodAppGetAccessToken:
		return h.Services.AppGetAccessToken(ctx)
	case MethodAppCheckAuthStatus:
		return h.Services.AppCheckAuthStatus(ctx)
	case MethodAppLogout:
		return h.Services.AppLogout(ctx)
	case MethodAppReloadAuthConfig:
		return h.Services.AppReloadAuthConfig(ctx)
	case MethodAgentListModels:
		var req SystemAgentListModelsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.AgentListModels(ctx, req)
	case MethodTokenUsageDebugState:
		return h.Services.TokenUsageDebugState(ctx)
	case MethodProjectList:
		var req SystemProjectListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ProjectList(ctx, req)
	case MethodNodeList:
		var req SystemNodeListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.NodeList(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "method not found: "+method)
	}
}
