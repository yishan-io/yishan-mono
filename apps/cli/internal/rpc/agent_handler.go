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

// DSHCredentialService backs the dsh.* credential RPC methods.
type DSHCredentialService interface {
	DSHListProviders(ctx context.Context) (any, error)
	DSHListCredentials(ctx context.Context) (any, error)
	DSHSaveCredential(ctx context.Context, req DSHSaveCredentialParams) (any, error)
	DSHRemoveCredential(ctx context.Context, req DSHRemoveCredentialParams) (any, error)
	DSHListPlugins(ctx context.Context) (any, error)
	DSHListOfficialPlugins(ctx context.Context) (any, error)
	DSHInstallPlugin(ctx context.Context, req DSHPluginNameParams) (any, error)
	DSHSetPluginEnabled(ctx context.Context, req DSHSetPluginEnabledParams) (any, error)
	DSHRemovePlugin(ctx context.Context, req DSHPluginNameParams) (any, error)
	DSHUpdatePlugin(ctx context.Context, req DSHPluginNameParams) (any, error)
	DSHListLocalPlugins(ctx context.Context) (any, error)
	DSHRegisterLocalPlugin(ctx context.Context, req DSHLocalPluginRegisterParams) (any, error)
	DSHRemoveLocalPlugin(ctx context.Context, req DSHLocalPluginNameParams) (any, error)
}

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

// AgentService backs the runtime-neutral agent.* facade.
type AgentService interface {
	AgentGetCapabilities(ctx context.Context) (any, error)
	AgentStart(ctx context.Context, connection *Connection, req AgentStartParams) (any, error)
	AgentAttach(ctx context.Context, connection *Connection, req AgentAttachParams) (any, error)
	AgentPrompt(ctx context.Context, req AgentPromptParams) (any, error)
	AgentAbort(ctx context.Context, req AgentAbortParams) (any, error)
	AgentSetModel(ctx context.Context, req AgentSetModelParams) (any, error)
	AgentDispose(ctx context.Context, req AgentDisposeParams) (any, error)
	AgentListSessions(ctx context.Context, req AgentListSessionsParams) (any, error)
	AgentListSessionLineage(ctx context.Context, req AgentListSessionLineageParams) (any, error)
	AgentCancelSubagent(ctx context.Context, req AgentCancelSubagentParams) (any, error)
	AgentReadHistory(ctx context.Context, req AgentReadHistoryParams) (any, error)
}

// AgentCatalogService preserves the existing agent catalog routes while the
// agent namespace is owned by AgentHandler.
type AgentCatalogService interface {
	AgentListDetectionStatuses(ctx context.Context, params json.RawMessage) (any, error)
	AgentListModels(ctx context.Context, req SystemAgentListModelsParams) (any, error)
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

// CustomizeService backs the customize.* RPC methods (tools, extensions, and
// agents panels).
type CustomizeService interface {
	ToolsList(ctx context.Context) (any, error)
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

// AgentHandler owns the agent.*, pi.*, skill.*, and customize.* namespace decoding.
// It routes by namespace prefix and each method calls exactly one typed
// service method. It holds no state and constructs no services.
type AgentHandler struct {
	Agent     AgentService
	Catalog   AgentCatalogService
	Pi        PiService
	DSH       DSHCredentialService
	Skill     SkillService
	Customize CustomizeService
}

// Call implements Handler.
func (h *AgentHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch {
	case strings.HasPrefix(method, "agent."):
		return h.callAgent(ctx, connection, method, params)
	case strings.HasPrefix(method, "pi."):
		return h.callPi(ctx, connection, method, params)
	case strings.HasPrefix(method, "dsh."):
		return h.callDSH(ctx, method, params)
	case strings.HasPrefix(method, "skill."):
		return h.callSkill(ctx, method, params)
	case strings.HasPrefix(method, "customize."):
		return h.callCustomize(ctx, method, params)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown agent method: "+method)
	}
}

func (h *AgentHandler) callAgent(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodAgentGetCapabilities:
		return h.Agent.AgentGetCapabilities(ctx)
	case MethodAgentListDetectionStatuses:
		return h.Catalog.AgentListDetectionStatuses(ctx, params)
	case MethodAgentListModels:
		var req SystemAgentListModelsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Catalog.AgentListModels(ctx, req)
	case MethodAgentStart:
		var req AgentStartParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentStart(ctx, connection, req)
	case MethodAgentAttach:
		var req AgentAttachParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentAttach(ctx, connection, req)
	case MethodAgentPrompt:
		var req AgentPromptParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentPrompt(ctx, req)
	case MethodAgentAbort:
		var req AgentAbortParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentAbort(ctx, req)
	case MethodAgentSetModel:
		var req AgentSetModelParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentSetModel(ctx, req)
	case MethodAgentDispose:
		var req AgentDisposeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentDispose(ctx, req)
	case MethodAgentListSessions:
		var req AgentListSessionsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentListSessions(ctx, req)
	case MethodAgentListSessionLineage:
		var req AgentListSessionLineageParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentListSessionLineage(ctx, req)
	case MethodAgentCancelSubagent:
		var req AgentCancelSubagentParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentCancelSubagent(ctx, req)
	case MethodAgentReadHistory:
		var req AgentReadHistoryParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Agent.AgentReadHistory(ctx, req)
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
	case "tools":
		return h.callCustomizeTools(ctx, method)
	case "extensions":
		return h.callCustomizeExtensions(ctx, method, params)
	case "agents":
		return h.callCustomizeAgents(ctx, method, params)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
	}
}

func (h *AgentHandler) callCustomizeTools(ctx context.Context, method string) (any, error) {
	if method == MethodCustomizeToolsList {
		return h.Customize.ToolsList(ctx)
	}
	return nil, NewRPCError(CodeMethodNotFound, "unknown customize method: "+method)
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

func (h *AgentHandler) callDSH(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDSHListProviders, MethodDSHListCredentials, MethodDSHSaveCredential, MethodDSHRemoveCredential:
		return h.callDSHCredentials(ctx, method, params)
	default:
		return h.callDSHPlugins(ctx, method, params)
	}
}

func (h *AgentHandler) callDSHCredentials(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodDSHListProviders:
		return h.DSH.DSHListProviders(ctx)
	case MethodDSHListCredentials:
		return h.DSH.DSHListCredentials(ctx)
	case MethodDSHSaveCredential:
		var req DSHSaveCredentialParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHSaveCredential(ctx, req)
	case MethodDSHRemoveCredential:
		var req DSHRemoveCredentialParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.DSH.DSHRemoveCredential(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown dsh method: "+method)
	}
}
