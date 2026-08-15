package rpc

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/rpcerror"
)

// The agent namespace interfaces back the pi.*, skill.*, and customize.* RPC
// methods. Each method decodes its params in the AgentHandler and calls one
// typed service method; the service implementation owns all pi session and
// setup state. Handlers construct no services and hold no mutable state.

// PiService backs the pi.* RPC methods. PiStart and PiAttach are
// connection-bound: the calling WebSocket becomes the session's event sink.
type PiService interface {
	PiStart(ctx context.Context, connection *Connection, req PiStartParams) (any, error)
	PiAttach(ctx context.Context, connection *Connection, req PiAttachParams) (any, error)
	PiStop(ctx context.Context, req PiStopParams) (any, error)
	PiSend(ctx context.Context, req PiSendParams) (any, error)
	PiListSessions(ctx context.Context, req PiListSessionsParams) (any, error)
	PiListActiveSessions(ctx context.Context) (any, error)
	PiGetSessionFile(ctx context.Context, req PiGetSessionFileParams) (any, error)
	PiRename(ctx context.Context, req PiRenameParams) (any, error)
	PiListProviders(ctx context.Context) (any, error)
	PiSaveProvider(ctx context.Context, req PiSaveProviderParams) (any, error)
	PiRemoveProvider(ctx context.Context, req PiRemoveProviderParams) (any, error)
}

// SkillService backs the skill.* RPC methods.
type SkillService interface {
	SkillList(ctx context.Context) (any, error)
	SkillInfo(ctx context.Context, req SkillNameParams) (any, error)
	SkillDetail(ctx context.Context, req SkillNameParams) (any, error)
	SkillAdd(ctx context.Context, req SkillSourceParams) (any, error)
	SkillRemove(ctx context.Context, req SkillNameParams) (any, error)
	SkillUpdate(ctx context.Context, req SkillNameParams) (any, error)
	SkillUpdateAll(ctx context.Context) (any, error)
}

// CustomizeService backs the customize.* RPC methods (extensions and agents
// panels).
type CustomizeService interface {
	CustomizeExtensionsList(ctx context.Context) (any, error)
	CustomizeExtensionsInstall(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	CustomizeExtensionsRemove(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	CustomizeExtensionsUpdate(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	CustomizeAgentsList(ctx context.Context) (any, error)
	CustomizeAgentsDetail(ctx context.Context, req CustomizeAgentNameParams) (any, error)
	CustomizeAgentsCreate(ctx context.Context, req CustomizeAgentCreateParams) (any, error)
	CustomizeAgentsUpdate(ctx context.Context, req CustomizeAgentUpdateParams) (any, error)
	CustomizeAgentsRemove(ctx context.Context, req CustomizeAgentNameParams) (any, error)
	CustomizeAgentsRestore(ctx context.Context, req CustomizeAgentNameParams) (any, error)
}

// AgentHandler owns the pi.*, skill.*, and customize.* namespace decoding.
// It routes by namespace prefix and each method calls exactly one typed
// service method. It holds no state and constructs no services.
type AgentHandler struct {
	Pi        PiService
	Skill     SkillService
	Customize CustomizeService
}

// Call implements Handler.
func (h *AgentHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch {
	case strings.HasPrefix(method, "pi."):
		return h.callPi(ctx, connection, method, params)
	case strings.HasPrefix(method, "skill."):
		return h.callSkill(ctx, method, params)
	case strings.HasPrefix(method, "customize."):
		return h.callCustomize(ctx, method, params)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown agent method: "+method)
	}
}

func (h *AgentHandler) callPi(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodPiStart:
		var req PiStartParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiStart(ctx, connection, req)
	case MethodPiAttach:
		var req PiAttachParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiAttach(ctx, connection, req)
	case MethodPiStop:
		var req PiStopParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiStop(ctx, req)
	case MethodPiSend:
		var req PiSendParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiSend(ctx, req)
	case MethodPiListSessions:
		var req PiListSessionsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiListSessions(ctx, req)
	case MethodPiListActiveSessions:
		return h.Pi.PiListActiveSessions(ctx)
	case MethodPiGetSessionFile:
		var req PiGetSessionFileParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiGetSessionFile(ctx, req)
	case MethodPiRename:
		var req PiRenameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiRename(ctx, req)
	case MethodPiListProviders:
		return h.Pi.PiListProviders(ctx)
	case MethodPiSaveProvider:
		var req PiSaveProviderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiSaveProvider(ctx, req)
	case MethodPiRemoveProvider:
		var req PiRemoveProviderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.PiRemoveProvider(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown pi method: "+method)
	}
}

func (h *AgentHandler) callSkill(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodSkillList:
		return h.Skill.SkillList(ctx)
	case MethodSkillInfo:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.SkillInfo(ctx, req)
	case MethodSkillDetail:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.SkillDetail(ctx, req)
	case MethodSkillAdd:
		var req SkillSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.SkillAdd(ctx, req)
	case MethodSkillRemove:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.SkillRemove(ctx, req)
	case MethodSkillUpdate:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.SkillUpdate(ctx, req)
	case MethodSkillUpdateAll:
		return h.Skill.SkillUpdateAll(ctx)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown skill method: "+method)
	}
}

func (h *AgentHandler) callCustomize(ctx context.Context, method string, params json.RawMessage) (any, error) {
	sub, _, found := strings.Cut(strings.TrimPrefix(method, "customize."), ".")
	if !found {
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown customize method: "+method)
	}
	switch sub {
	case "extensions":
		return h.callCustomizeExtensions(ctx, method, params)
	case "agents":
		return h.callCustomizeAgents(ctx, method, params)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown customize method: "+method)
	}
}

func (h *AgentHandler) callCustomizeExtensions(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeExtensionsList:
		return h.Customize.CustomizeExtensionsList(ctx)
	case MethodCustomizeExtensionsInstall:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeExtensionsInstall(ctx, req)
	case MethodCustomizeExtensionsRemove:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeExtensionsRemove(ctx, req)
	case MethodCustomizeExtensionsUpdate:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeExtensionsUpdate(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown customize method: "+method)
	}
}

func (h *AgentHandler) callCustomizeAgents(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeAgentsList:
		return h.Customize.CustomizeAgentsList(ctx)
	case MethodCustomizeAgentsDetail:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeAgentsDetail(ctx, req)
	case MethodCustomizeAgentsCreate:
		var req CustomizeAgentCreateParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeAgentsCreate(ctx, req)
	case MethodCustomizeAgentsUpdate:
		var req CustomizeAgentUpdateParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeAgentsUpdate(ctx, req)
	case MethodCustomizeAgentsRemove:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeAgentsRemove(ctx, req)
	case MethodCustomizeAgentsRestore:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.CustomizeAgentsRestore(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown customize method: "+method)
	}
}
