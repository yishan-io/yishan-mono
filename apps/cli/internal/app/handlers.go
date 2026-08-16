package app

import (
	"context"
	"encoding/json"
	"net/http"

	nodeagent "yishan/apps/cli/internal/node/agent"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
)

// appHandler adapts the namespace router into the rpc server handler and
// tracks desktop connections (task-run execution prefers the agent chat tab
// when a desktop UI is connected).
type appHandler struct {
	router *rpc.Router
	agent  *nodeagent.Service
}

// Call implements rpc.Handler.
func (h appHandler) Call(ctx context.Context, connection *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return h.router.Call(ctx, connection, method, params)
}

// OnConnect implements rpc.ConnectionHandler: desktop clients are tracked so
// task-run execution can prefer the agent chat tab over a pi CLI terminal.
func (h appHandler) OnConnect(connection *rpc.Connection, request *http.Request) {
	if request.URL.Query().Get("client") != "desktop" {
		return
	}
	h.agent.TrackDesktop(connection)
	connection.AddCloseHook(func() {
		h.agent.UntrackDesktop(connection)
	})
}

// relayHandler dispatches relay-level messages the relay client does not own:
// job dispatch goes to the system service, workspace snapshot changes to the
// workspace service, terminal session/stream messages to the terminal service.
type relayHandler struct {
	system    *nodesystem.Service
	workspace *nodeworkspace.Service
	terminal  *nodeterminal.Service
	runtime   *cliruntime.Runtime
}

// HandleRelayMessage implements relay.MessageHandler.
func (h relayHandler) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodJobRun:
		nodesystem.HandleJobRun(h.runtime, connState, nodeID, params)
		return true
	case relay.MethodWorkspaceSnapshotChanged:
		return h.workspace.HandleRelayMessage(ctx, connState, nodeID, method, params)
	default:
		return h.terminal.HandleRelayMessage(ctx, connState, nodeID, method, params)
	}
}
