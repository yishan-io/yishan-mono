package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/rpcerror"
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
		return h.Services.SystemDaemonPing()
	case MethodFrontendEventsStream:
		return h.Services.SystemFrontendEventsStream(ctx, connection)
	case MethodAgentListDetectionStatuses:
		return h.Services.SystemAgentListDetectionStatuses(ctx, params)
	case MethodCLIToolListStatuses:
		return h.Services.SystemCLIToolListStatuses(ctx, params)
	case MethodCLIToolInstall:
		var req SystemCLIToolInstallParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SystemCLIToolInstall(ctx, req)
	case MethodCLIToolUninstall:
		var req SystemCLIToolUninstallParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SystemCLIToolUninstall(ctx, req)
	case MethodIntegrationGitHubStatus:
		return h.Services.SystemIntegrationGitHubStatus(ctx, params)
	case MethodAppPersistAuthTokens:
		return h.Services.SystemAppPersistAuthTokens(ctx, params)
	case MethodAppGetAccessToken:
		return h.Services.SystemAppGetAccessToken(ctx)
	case MethodAppCheckAuthStatus:
		return h.Services.SystemAppCheckAuthStatus(ctx)
	case MethodAppLogout:
		return h.Services.SystemAppLogout(ctx)
	case MethodAppReloadAuthConfig:
		return h.Services.SystemAppReloadAuthConfig(ctx)
	case MethodAgentListModels:
		var req SystemAgentListModelsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SystemAgentListModels(ctx, req)
	case MethodTokenUsageDebugState:
		return h.Services.SystemTokenUsageDebugState(ctx)
	case MethodProjectList:
		var req SystemProjectListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SystemProjectList(ctx, req)
	case MethodNodeList:
		var req SystemNodeListParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SystemNodeList(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "method not found: "+method)
	}
}
