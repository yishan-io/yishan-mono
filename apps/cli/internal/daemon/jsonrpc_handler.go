package daemon

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/agentmanager"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/modellist"
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/piauth"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	workspaceprtracker "yishan/apps/cli/internal/workspace/prtracker"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

const (
	// Binary frame opcodes for terminal I/O fast-path.
	binOpcodeTerminalInput    byte = 0x01
	binOpcodeTerminalOutput   byte = 0x02
	maxInFlightJSONRPCPerConn      = 16
)

// JSONRPCHandler is the RPC transport: it decodes JSON-RPC requests, routes
// them through dispatch, and owns WebSocket connection state. It does not
// construct business services — every service comes from the node.App built
// by the composition root.
type JSONRPCHandler struct {
	upgrader          websocket.Upgrader
	nodeApp           *node.App
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
	desktopConns   map[*wsConnState]struct{}

	// stoppingPiSessions tracks pi session ids whose teardown (pi.stop) is in
	// flight, so concurrent pi.start/pi.attach cannot bind to a dying process.
	stoppingPiSessions map[string]struct{}

	remoteStreamMu   sync.Mutex
	remoteStreamSubs map[string]map[*wsConnState]struct{}

	// relayConn is the active relay WebSocket connection, set while a relay
	// session is running. Used by terminal.remote.subscribe to send stream
	// requests to the relay on behalf of the desktop.
	relayConnMu sync.RWMutex
	relayConn   *wsConnState

	// relayPending holds pending relay dispatch answers (workspace create/close
	// routing verdicts) keyed by request id. The relay answers synchronously when
	// a targeted envelope is sent as a JSON-RPC request; entries expire on timeout.
	relayPendingMu sync.Mutex
	relayPending   map[string]chan relayDispatchVerdict
}

// NewJSONRPCHandler wires the RPC transport around a composed node app. All
// business services (workspace manager, memory, computer, agents, events,
// watchers, PR tracker, cleanup/context stores, token usage) are owned by the
// app; the handler only binds them to WebSocket/JSON-RPC transport.
func NewJSONRPCHandler(app *node.App) *JSONRPCHandler {
	handler := &JSONRPCHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
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
		desktopConns:       make(map[*wsConnState]struct{}),
		stoppingPiSessions: make(map[string]struct{}),
		remoteStreamSubs:   make(map[string]map[*wsConnState]struct{}),
		relayPending:       make(map[string]chan relayDispatchVerdict),
	}
	if handler.agentLifecycleCtx == nil {
		handler.agentLifecycleCtx = context.Background()
	}
	if handler.serverCtx == nil {
		handler.serverCtx = context.Background()
	}
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
	handler.app = newWorkspaceApplicationService(handler)
	return handler
}

// SetComputerService replaces the computer-use service (test injection).
func (h *JSONRPCHandler) SetComputerService(svc *computer.Service) {
	if svc == nil {
		return
	}
	h.computer = svc
}

func (h *JSONRPCHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}
	connState := newWSConnState(conn)
	if r.URL.Query().Get("client") == "desktop" {
		h.desktopConnsMu.Lock()
		h.desktopConns[connState] = struct{}{}
		h.desktopConnsMu.Unlock()
		connState.AddCloseHook(func() {
			h.desktopConnsMu.Lock()
			delete(h.desktopConns, connState)
			h.desktopConnsMu.Unlock()
		})
	}
	defer connState.Close()
	connCtx, cancelConn := context.WithCancel(context.Background())
	defer cancelConn()

	jsonRPCSem := make(chan struct{}, maxInFlightJSONRPCPerConn)
	var inFlight sync.WaitGroup
	defer inFlight.Wait()

	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("websocket read failed")
			}
			return
		}

		// Binary frames are terminal I/O fast-path — skip JSON-RPC entirely.
		if msgType == websocket.BinaryMessage {
			h.handleBinaryFrame(connState, payload)
			continue
		}

		// Dispatch JSON-RPC requests asynchronously so that slow handlers
		// never block the read loop (and therefore never starve terminal input).
		//
		// Use a connection-lifetime context rather than r.Context(). After the
		// WebSocket upgrade the HTTP request context is no longer meaningful —
		// it's tied to the upgrade request, not the WS lifetime. Each handler
		// method still manages its own timeout budget internally.
		jsonRPCSem <- struct{}{}
		inFlight.Add(1)
		go func(data []byte) {
			defer func() {
				<-jsonRPCSem
				inFlight.Done()
			}()

			resp := h.handleRequest(connCtx, connState, data)
			if resp == nil {
				return
			}

			if err := connState.WriteJSON(resp); err != nil {
				log.Error().Err(err).Msg("websocket write failed")
			}
		}(payload)
	}
}

// handleBinaryFrame processes a binary WebSocket frame for terminal I/O.
// Frame format: [1 byte opcode] [session ID (null-terminated)] [payload]
func (h *JSONRPCHandler) handleBinaryFrame(connState *wsConnState, payload []byte) {
	if len(payload) < 3 { // minimum: opcode + at least 1 char session ID + null terminator
		return
	}

	opcode := payload[0]
	rest := payload[1:]
	nullIdx := bytes.IndexByte(rest, 0)
	if nullIdx < 0 {
		return
	}
	sessionID := connState.terminalInputSessionID(rest[:nullIdx])

	switch opcode {
	case binOpcodeTerminalInput:
		inputData := rest[nullIdx+1:]
		if len(inputData) == 0 {
			return
		}
		if h.forwardRemoteTerminalInput(sessionID, payload) {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		h.manager.Terminals().SendRaw(sessionID, inputData)
	case binOpcodeTerminalOutput:
		h.forwardRemoteTerminalOutput(sessionID, payload)
	}
}

func (h *JSONRPCHandler) handleRequest(ctx context.Context, connState *wsConnState, payload []byte) *response {
	var req request
	if err := json.Unmarshal(payload, &req); err != nil {
		return &response{JSONRPC: "2.0", Error: &rpcError{Code: rpcCodeParseError, Message: "parse error"}}
	}

	if req.JSONRPC != "2.0" {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: &rpcError{Code: rpcCodeInvalidRequest, Message: "invalid request"}}
	}

	result, err := h.dispatch(ctx, connState, req.Method, req.Params)
	if err != nil {
		return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Error: mapRPCError(err)}
	}

	if len(req.ID) == 0 {
		return nil
	}

	return &response{JSONRPC: "2.0", ID: asJSONID(req.ID), Result: result}
}
