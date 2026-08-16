package rpc

import (
	"context"
	"encoding/json"
	"strings"
)

// The agent namespace interfaces back the pi.*, skill.*, and customize.* RPC
// methods. Each method decodes its params in the AgentHandler and calls one
// typed service method; the service implementation owns all pi session and
// setup state. Handlers construct no services and hold no mutable state.

// PiService backs the pi.* RPC methods. PiStart and PiAttach are
// connection-bound: the calling WebSocket becomes the session's event sink.
type PiService interface {
	Start(ctx context.Context, connection *Connection, req PiStartParams) (any, error)
	Attach(ctx context.Context, connection *Connection, req PiAttachParams) (any, error)
	Stop(ctx context.Context, req PiStopParams) (any, error)
	Send(ctx context.Context, req PiSendParams) (any, error)
	ListSessions(ctx context.Context, req PiListSessionsParams) (any, error)
	ListActiveSessions(ctx context.Context) (any, error)
	GetSessionFile(ctx context.Context, req PiGetSessionFileParams) (any, error)
	Rename(ctx context.Context, req PiRenameParams) (any, error)
	ListProviders(ctx context.Context) (any, error)
	SaveProvider(ctx context.Context, req PiSaveProviderParams) (any, error)
	RemoveProvider(ctx context.Context, req PiRemoveProviderParams) (any, error)
}

// SkillService backs the skill.* RPC methods.
type SkillService interface {
	List(ctx context.Context) (any, error)
	Info(ctx context.Context, req SkillNameParams) (any, error)
	Detail(ctx context.Context, req SkillNameParams) (any, error)
	Add(ctx context.Context, req SkillSourceParams) (any, error)
	Remove(ctx context.Context, req SkillNameParams) (any, error)
	Update(ctx context.Context, req SkillNameParams) (any, error)
	UpdateAll(ctx context.Context) (any, error)
}

// CustomizeService backs the customize.* RPC methods (extensions and agents
// panels).
type CustomizeService interface {
	ExtensionsList(ctx context.Context) (any, error)
	ExtensionsInstall(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	ExtensionsRemove(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	ExtensionsUpdate(ctx context.Context, req CustomizeExtensionSourceParams) (any, error)
	AgentsList(ctx context.Context) (any, error)
	AgentsDetail(ctx context.Context, req CustomizeAgentNameParams) (any, error)
	AgentsCreate(ctx context.Context, req CustomizeAgentCreateParams) (any, error)
	AgentsUpdate(ctx context.Context, req CustomizeAgentUpdateParams) (any, error)
	AgentsRemove(ctx context.Context, req CustomizeAgentNameParams) (any, error)
	AgentsRestore(ctx context.Context, req CustomizeAgentNameParams) (any, error)
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
		return nil, NewRPCError(CodeMethodNotFound, "unknown agent method: "+method)
	}
}

func (h *AgentHandler) callPi(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodPiStart:
		var req PiStartParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.Start(ctx, connection, req)
	case MethodPiAttach:
		var req PiAttachParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.Attach(ctx, connection, req)
	case MethodPiStop:
		var req PiStopParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.Stop(ctx, req)
	case MethodPiSend:
		var req PiSendParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.Send(ctx, req)
	case MethodPiListSessions:
		var req PiListSessionsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.ListSessions(ctx, req)
	case MethodPiListActiveSessions:
		return h.Pi.ListActiveSessions(ctx)
	case MethodPiGetSessionFile:
		var req PiGetSessionFileParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.GetSessionFile(ctx, req)
	case MethodPiRename:
		var req PiRenameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.Rename(ctx, req)
	case MethodPiListProviders:
		return h.Pi.ListProviders(ctx)
	case MethodPiSaveProvider:
		var req PiSaveProviderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.SaveProvider(ctx, req)
	case MethodPiRemoveProvider:
		var req PiRemoveProviderParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Pi.RemoveProvider(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown pi method: "+method)
	}
}

func (h *AgentHandler) callSkill(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodSkillList:
		return h.Skill.List(ctx)
	case MethodSkillInfo:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.Info(ctx, req)
	case MethodSkillDetail:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.Detail(ctx, req)
	case MethodSkillAdd:
		var req SkillSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.Add(ctx, req)
	case MethodSkillRemove:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.Remove(ctx, req)
	case MethodSkillUpdate:
		var req SkillNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Skill.Update(ctx, req)
	case MethodSkillUpdateAll:
		return h.Skill.UpdateAll(ctx)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown skill method: "+method)
	}
}

func (h *AgentHandler) callCustomize(ctx context.Context, method string, params json.RawMessage) (any, error) {
	sub, _, found := strings.Cut(strings.TrimPrefix(method, "customize."), ".")
	if !found {
		return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
	}
	switch sub {
	case "extensions":
		return h.callCustomizeExtensions(ctx, method, params)
	case "agents":
		return h.callCustomizeAgents(ctx, method, params)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
	}
}

func (h *AgentHandler) callCustomizeExtensions(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeExtensionsList:
		return h.Customize.ExtensionsList(ctx)
	case MethodCustomizeExtensionsInstall:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.ExtensionsInstall(ctx, req)
	case MethodCustomizeExtensionsRemove:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.ExtensionsRemove(ctx, req)
	case MethodCustomizeExtensionsUpdate:
		var req CustomizeExtensionSourceParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.ExtensionsUpdate(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
	}
}

func (h *AgentHandler) callCustomizeAgents(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodCustomizeAgentsList:
		return h.Customize.AgentsList(ctx)
	case MethodCustomizeAgentsDetail:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.AgentsDetail(ctx, req)
	case MethodCustomizeAgentsCreate:
		var req CustomizeAgentCreateParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.AgentsCreate(ctx, req)
	case MethodCustomizeAgentsUpdate:
		var req CustomizeAgentUpdateParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.AgentsUpdate(ctx, req)
	case MethodCustomizeAgentsRemove:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.AgentsRemove(ctx, req)
	case MethodCustomizeAgentsRestore:
		var req CustomizeAgentNameParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Customize.AgentsRestore(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
	}
}
