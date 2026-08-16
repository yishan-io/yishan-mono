package app

import (
	"yishan/apps/cli/internal/node"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/rpc"
)

// buildNamespaceRouter wires the JSON-RPC namespace routing table. Each
// namespace has one transport owner: the rpc namespace handlers own decoding
// and call exactly one typed service method; the daemon implements the
// services. The agent namespaces (pi/skill/customize) route through the rpc
// AgentHandler into the daemon's AgentService implementation.
func buildNamespaceRouter(h *node.Service, workspaceSvc *nodeworkspace.Service, projectSvc *nodeproject.Service, systemSvc *nodesystem.Service) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: h})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: h})
	router.Register("context", &rpc.ContextHandler{Services: systemSvc})
	router.Register("git", &rpc.GitHandler{Services: workspaceSvc})
	router.Register("file", &rpc.FileHandler{Services: workspaceSvc})
	router.Register("terminal", &rpc.TerminalHandler{Services: h})
	router.Register("computer", &rpc.ComputerHandler{Services: systemSvc})
	router.Register("memory", &rpc.MemoryHandler{Services: systemSvc})
	router.Register("project", &rpc.ProjectHandler{Services: projectSvc})
	router.Register("system", &rpc.SystemHandler{Services: systemSvc})
	router.Register("pi", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	router.Register("skill", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	router.Register("customize", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	return router
}
