package app

import (
	nodeagent "yishan/apps/cli/internal/node/agent"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/rpc"
)

// buildNamespaceRouter wires the JSON-RPC namespace routing table. Each
// namespace has one transport owner: the rpc namespace handlers own decoding
// and call exactly one typed service method; the daemon implements the
// services. The agent namespaces (pi/skill/customize) route through the rpc
// AgentHandler into the daemon's AgentService implementation.
func buildNamespaceRouter(agentSvc *nodeagent.Service, workspaceSvc *nodeworkspace.Service, terminalSvc *nodeterminal.Service, projectSvc *nodeproject.Service, systemSvc *nodesystem.Service, localTaskSvc *nodelocaltask.Service) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: workspaceSvc})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: workspaceSvc})
	router.Register("context", &rpc.ContextHandler{Services: systemSvc})
	router.Register("git", &rpc.GitHandler{Services: workspaceSvc})
	router.Register("file", &rpc.FileHandler{Services: workspaceSvc})
	router.Register("terminal", &rpc.TerminalHandler{Services: terminalSvc})
	router.Register("computer", &rpc.ComputerHandler{Services: systemSvc})
	router.Register("memory", &rpc.MemoryHandler{Services: systemSvc})
	router.Register("project", &rpc.ProjectHandler{Services: projectSvc})
	router.Register("localTask", &rpc.LocalTaskHandler{Services: localTaskSvc})
	router.Register("system", &rpc.SystemHandler{Services: systemSvc})
	router.Register("agent", &rpc.AgentHandler{Agent: agentSvc, Catalog: systemSvc})
	router.Register("pi", &rpc.AgentHandler{Pi: agentSvc, Skill: agentSvc, Customize: agentSvc})
	router.Register("skill", &rpc.AgentHandler{Pi: agentSvc, Skill: agentSvc, Customize: agentSvc})
	router.Register("customize", &rpc.AgentHandler{Pi: agentSvc, Skill: agentSvc, Customize: agentSvc})
	return router
}
