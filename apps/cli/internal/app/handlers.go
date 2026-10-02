package app

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	nodeagent "yishan/apps/cli/internal/node/agent"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
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

// relayHandler dispatches relay-level messages the relay client does not own:
// job dispatch goes to the system service, workspace snapshot changes to the
// workspace service, terminal session/stream messages to the terminal service.
type scheduleRefreshState struct {
	mu      sync.Mutex
	running bool
	pending bool
}

type relayHandler struct {
	system               *nodesystem.Service
	workspace            *nodeworkspace.Service
	terminal             *nodeterminal.Service
	runtime              *session.Session
	daemonWSEndpoint     string
	refreshScheduledJobs func(context.Context)
	scheduleRefreshState *scheduleRefreshState
}

// HandleRelayMessage implements relay.MessageHandler.
func (h relayHandler) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodJobScheduleChanged:
		h.requestScheduledJobsRefresh(ctx)
		return true
	case relay.MethodJobRun:
		nodesystem.HandleJobRun(h.runtime, connState, nodeID, params, h.daemonWSEndpoint)
		return true
	case relay.MethodWorkspaceSnapshotChanged:
		return h.workspace.HandleRelayMessage(ctx, connState, nodeID, method, params)
	default:
		return h.terminal.HandleRelayMessage(ctx, connState, nodeID, method, params)
	}
}

// requestScheduledJobsRefresh schedules one lifecycle-bound refresh and retains
// one additional request received while that refresh is in progress.
func (h relayHandler) requestScheduledJobsRefresh(ctx context.Context) {
	if h.refreshScheduledJobs == nil || h.scheduleRefreshState == nil || ctx.Err() != nil {
		return
	}
	h.scheduleRefreshState.mu.Lock()
	if h.scheduleRefreshState.running {
		h.scheduleRefreshState.pending = true
		h.scheduleRefreshState.mu.Unlock()
		return
	}
	h.scheduleRefreshState.running = true
	h.scheduleRefreshState.mu.Unlock()
	go h.runScheduledJobsRefresh(ctx)
}

func (h relayHandler) runScheduledJobsRefresh(ctx context.Context) {
	for {
		h.refreshScheduledJobs(ctx)
		h.scheduleRefreshState.mu.Lock()
		if ctx.Err() != nil || !h.scheduleRefreshState.pending {
			h.scheduleRefreshState.running = false
			h.scheduleRefreshState.pending = false
			h.scheduleRefreshState.mu.Unlock()
			return
		}
		h.scheduleRefreshState.pending = false
		h.scheduleRefreshState.mu.Unlock()
	}
}
