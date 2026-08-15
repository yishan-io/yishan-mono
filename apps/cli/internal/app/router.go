package app

import (
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/rpc"
)

// buildNamespaceRouter wires the JSON-RPC namespace routing table. Each
// namespace has one transport owner: the rpc namespace handlers own decoding
// and call exactly one typed service method; the daemon implements the
// services. The agent namespaces (pi/skill/customize) route through the rpc
// AgentHandler into the daemon's AgentService implementation.
func buildNamespaceRouter(h *node.Service) *rpc.Router {
	router := rpc.NewRouter()
	router.Register("list", &rpc.WorkspaceHandler{Services: h})
	router.Register("workspace", &rpc.WorkspaceHandler{Services: h})
	router.Register("context", &rpc.ContextHandler{Services: h})
	router.Register("git", &rpc.GitHandler{Services: h})
	router.Register("file", &rpc.FileHandler{Services: h})
	router.Register("terminal", &rpc.TerminalHandler{Services: h})
	router.Register("computer", &rpc.ComputerHandler{Services: h})
	router.Register("memory", &rpc.MemoryHandler{Services: h})
	router.Register("project", &rpc.ProjectHandler{Services: h})
	router.Register("system", &rpc.SystemHandler{Services: h})
	router.Register("pi", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	router.Register("skill", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	router.Register("customize", &rpc.AgentHandler{Pi: h, Skill: h, Customize: h})
	return router
}
