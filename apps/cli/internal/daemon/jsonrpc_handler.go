package daemon

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"
	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/modellist"
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/piauth"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	workspaceprtracker "yishan/apps/cli/internal/workspace/prtracker"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

const (
	// Binary frame opcodes for terminal I/O fast-path.
	binOpcodeTerminalInput  byte = 0x01
	binOpcodeTerminalOutput byte = 0x02
)

// JSONRPCHandler is the daemon's RPC layer: it implements the rpc.Handler
// interfaces on top of the composed node app. It does not construct business
// services and it does not own WebSocket mechanics (rpc.Server does) — it only
// routes method calls to the namespace dispatch handlers.
type JSONRPCHandler struct {
	nodeApp           *node.App
	rpcServer         *rpc.Server
	router            *rpc.Router
	manager           *workspace.Manager
	runtime           *cliruntime.Runtime
	localDatabase     *sql.DB
	nodeID            string
	logFilePath       string
	cleanupStore      *node.CleanupStore
	context           *node.ContextStore
	events            *eventHub
	app               *application.Service
	watchers          *workspacewatchers.Watchers
	prTracker         *workspaceprtracker.Tracker
	tokenUsage        tokenusage.Service
	computer          *computer.Service
	modelList         *modellist.Service
	memory            *memory.Service
	agentMgr          *agentmanager.Manager
	piAuth            *piauth.Store
	agentLifecycleCtx context.Context
	serverCtx         context.Context
	settingsPath      string

	agentUsageMu sync.Mutex
	agentUsage   map[string]map[string]struct{}

	piSessionsMu sync.Mutex
	piSessions   map[string]*piSessionState

	// desktopConns tracks live WebSocket connections tagged as the Yishan
	// desktop app (client=desktop). Used to decide how task runs attached to
	// workspace creation execute: agent chat tab when a desktop UI is
	// connected, pi CLI terminal otherwise (headless/remote daemons).
	desktopConnsMu sync.Mutex
	desktopConns   map[*rpc.Connection]struct{}

	// stoppingPiSessions tracks pi session ids whose teardown (pi.stop) is in
	// flight, so concurrent pi.start/pi.attach cannot bind to a dying process.
	stoppingPiSessions map[string]struct{}

	remoteStreamMu   sync.Mutex
	remoteStreamSubs map[string]map[*rpc.Connection]struct{}

	// relayConn is the active relay WebSocket connection, set while a relay
	// session is running. Used by terminal.remote.subscribe to send stream
	// requests to the relay on behalf of the desktop.
	relayConnMu sync.RWMutex
	relayConn   *rpc.Connection

	// relayPending holds pending relay dispatch answers (workspace create/close
	// routing verdicts) keyed by request id. The relay answers synchronously when
	// a targeted envelope is sent as a JSON-RPC request; entries expire on timeout.
	relayPendingMu sync.Mutex
	relayPending   map[string]chan relayDispatchVerdict
}

// NewJSONRPCHandler wires the RPC layer around a composed node app: it builds
// the namespace router and the transport server, and binds every business
// service from the app. The handler itself constructs no services.
func NewJSONRPCHandler(app *node.App) *JSONRPCHandler {
	handler := &JSONRPCHandler{
		nodeApp:            app,
		manager:            app.Manager,
		runtime:            app.Runtime,
		nodeID:             app.NodeID,
		logFilePath:        app.LogFilePath,
		cleanupStore:       app.CleanupStore,
		context:            app.ContextStore,
		events:             app.Events,
		watchers:           app.Watchers,
		prTracker:          app.PRTracker,
		tokenUsage:         app.TokenUsage,
		computer:           app.Computer,
		modelList:          app.ModelList,
		memory:             app.Memory,
		agentMgr:           app.AgentMgr,
		piAuth:             app.PIAuth,
		agentLifecycleCtx:  app.AgentLifecycleCtx,
		serverCtx:          app.ServerCtx,
		settingsPath:       app.SettingsPath,
		agentUsage:         make(map[string]map[string]struct{}),
		piSessions:         make(map[string]*piSessionState),
		desktopConns:       make(map[*rpc.Connection]struct{}),
		stoppingPiSessions: make(map[string]struct{}),
		remoteStreamSubs:   make(map[string]map[*rpc.Connection]struct{}),
		relayPending:       make(map[string]chan relayDispatchVerdict),
	}
	if handler.agentLifecycleCtx == nil {
		handler.agentLifecycleCtx = context.Background()
	}
	if handler.serverCtx == nil {
		handler.serverCtx = context.Background()
	}
	handler.router = buildNamespaceRouter(handler)
	handler.rpcServer = rpc.NewServer(handler)
	handler.rpcServer.BinaryFrameHandler = handler
	handler.app = newWorkspaceApplicationService(handler)

	// Terminal lifecycle events flow into the frontend event hub.
	app.Manager.Terminals().SetPortsChangedListener(func(ports []workspace.TerminalDetectedPort) {
		app.Events.Publish(frontendEvent{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	app.Manager.Terminals().SetSessionsChangedListener(func(event workspace.TerminalSessionLifecycleEvent) {
		app.Events.Publish(frontendEvent{
			Topic: "terminalSessionChanged",
			Payload: map[string]any{
				"action":      event.Action,
				"sessionId":   event.SessionID,
				"workspaceId": event.WorkspaceID,
				"tabId":       event.TabID,
				"paneId":      event.PaneID,
				"title":       event.Title,
				"agentKind":   event.AgentKind,
				"pid":         event.PID,
				"status":      event.Status,
				"startedAt":   event.StartedAt,
			},
		})
	})
	return handler
}

// SetComputerService replaces the computer-use service (test injection).
func (h *JSONRPCHandler) SetComputerService(svc *computer.Service) {
	if svc == nil {
		return
	}
	h.computer = svc
}

// Call implements rpc.Handler: it routes the method through the namespace
// router.
func (h *JSONRPCHandler) Call(ctx context.Context, connection *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return h.router.Call(ctx, connection, method, params)
}

// OnConnect implements rpc.ConnectionHandler: desktop clients are tracked so
// task-run execution can prefer the agent chat tab over a pi CLI terminal.
func (h *JSONRPCHandler) OnConnect(connection *rpc.Connection, request *http.Request) {
	if request.URL.Query().Get("client") != "desktop" {
		return
	}
	h.desktopConnsMu.Lock()
	h.desktopConns[connection] = struct{}{}
	h.desktopConnsMu.Unlock()
	connection.AddCloseHook(func() {
		h.desktopConnsMu.Lock()
		delete(h.desktopConns, connection)
		h.desktopConnsMu.Unlock()
	})
}

// HandleBinaryFrame implements rpc.BinaryFrameHandler: terminal I/O frames are
// forwarded to a remote node when the session is remote, or written to the
// local PTY directly.
func (h *JSONRPCHandler) HandleBinaryFrame(connection *rpc.Connection, opcode byte, sessionID string, payload []byte) {
	switch opcode {
	case binOpcodeTerminalInput:
		if h.forwardRemoteTerminalInput(sessionID, payload) {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		inputData := terminalInputData(payload)
		if len(inputData) == 0 {
			return
		}
		h.manager.Terminals().SendRaw(sessionID, inputData)
	case binOpcodeTerminalOutput:
		h.forwardRemoteTerminalOutput(sessionID, payload)
	}
}

// terminalInputData slices the payload after the null-terminated session id.
func terminalInputData(payload []byte) []byte {
	nullIdx := bytes.IndexByte(payload[1:], 0)
	if nullIdx < 0 {
		return nil
	}
	return payload[1+nullIdx+1:]
}
