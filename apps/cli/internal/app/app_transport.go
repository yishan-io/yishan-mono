package app

import (
	"net/http"

	"yishan/apps/cli/internal/adapter/relay"
	nodeagent "yishan/apps/cli/internal/node/agent"
	nodebackgroundjob "yishan/apps/cli/internal/node/backgroundjob"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	nodeproject "yishan/apps/cli/internal/node/project"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/rpc"
)

// RPCServer exposes the JSON-RPC/WebSocket transport server to the daemon process layer.
func (a *App) RPCServer() *rpc.Server { return a.rpcServer }

// Relay exposes the relay client (connection state owned by internal/relay).
func (a *App) Relay() *relay.Client { return a.relay }

// ServeAgentHook handles the agent hook HTTP ingress (pi notify bridge).
func (a *App) ServeAgentHook(w http.ResponseWriter, r *http.Request) { a.hookIngress.ServeHTTP(w, r) }

// NewRouter builds the namespace routing table for the node services.
func NewRouter(agentSvc *nodeagent.Service, backgroundJobSvc *nodebackgroundjob.Service, workspaceSvc *nodeworkspace.Service, terminalSvc *nodeterminal.Service, projectSvc *nodeproject.Service, systemSvc *nodesystem.Service, localTaskSvc *nodelocaltask.Service) *rpc.Router {
	return buildNamespaceRouter(agentSvc, backgroundJobSvc, workspaceSvc, terminalSvc, projectSvc, systemSvc, localTaskSvc)
}
