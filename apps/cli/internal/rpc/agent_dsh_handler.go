package rpc

import (
	"context"
	"encoding/json"
)

func (h *AgentHandler) callDSHPlugins(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDSHListPlugins, MethodDSHListOfficialPlugins, MethodDSHListLocalPlugins:
		return h.callDSHPluginLists(ctx, method)
	case MethodDSHInstallPlugin, MethodDSHSetPluginEnabled, MethodDSHRemovePlugin, MethodDSHUpdatePlugin:
		return h.callDSHPluginManagement(ctx, method, params)
	case MethodDSHRegisterLocalPlugin, MethodDSHRemoveLocalPlugin:
		return h.callDSHLocalPlugins(ctx, method, params)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown dsh method: "+method)
	}
}

func (h *AgentHandler) callDSHPluginLists(ctx context.Context, method string) (any, error) {
	switch method {
	case MethodDSHListPlugins:
		return h.DSH.DSHListPlugins(ctx)
	case MethodDSHListOfficialPlugins:
		return h.DSH.DSHListOfficialPlugins(ctx)
	case MethodDSHListLocalPlugins:
		return h.DSH.DSHListLocalPlugins(ctx)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown dsh method: "+method)
	}
}

func (h *AgentHandler) callDSHPluginManagement(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDSHInstallPlugin:
		var req DSHPluginNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHInstallPlugin(ctx, req)
	case MethodDSHSetPluginEnabled:
		var req DSHSetPluginEnabledParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHSetPluginEnabled(ctx, req)
	case MethodDSHRemovePlugin:
		var req DSHPluginNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHRemovePlugin(ctx, req)
	case MethodDSHUpdatePlugin:
		var req DSHPluginNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHUpdatePlugin(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown dsh method: "+method)
	}
}

func (h *AgentHandler) callDSHLocalPlugins(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDSHRegisterLocalPlugin:
		var req DSHLocalPluginRegisterParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHRegisterLocalPlugin(ctx, req)
	case MethodDSHRemoveLocalPlugin:
		var req DSHLocalPluginNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHRemoveLocalPlugin(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown dsh method: "+method)
	}
}
