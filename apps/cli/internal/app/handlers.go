package app

import (
	"context"
	"encoding/json"
	"net/http"

	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/rpc"
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
