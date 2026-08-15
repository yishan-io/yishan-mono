package node

import (
	"context"
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"

	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/computer"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

const (
	// Binary frame opcodes for terminal I/O fast-path.
	binOpcodeTerminalInput  byte = 0x01
	binOpcodeTerminalOutput byte = 0x02
)

// Services is the concrete implementation of the rpc namespace service
// interfaces (workspace/file/git/terminal/memory/computer/context/project/
// system/agent). It is built by the composition root and injected into the rpc
// namespace handlers; each method performs exactly one application operation.
// Services owns the mutable handler-level state that is neither transport
// (rpc.Server) nor domain (session.Registry) owned: desktop connection
// tracking, the remote terminal stream subscriptions, and the agent-usage
// map used by hook ingress.
type Services struct {
	nodeApp *App

	// The application service for workspace create/close orchestration.
	app *application.Service

	// Per-namespace rpc plumbing.
	router    *rpc.Router
	rpcServer *rpc.Server

	// Services the RPC methods operate on (mirrors the composed app).
	manager       *workspace.Manager
	runtime       *cliruntime.Runtime
	localDatabase *sql.DB
	nodeID        string
	logFilePath   string
	cleanupStore  *CleanupStore
	context       *ContextStore
	events        *internalevents.Hub
	watchers      *workspacewatchers.Watchers
	prTracker     *workspaceprtracker.Tracker
	tokenUsage    tokenusage.Service
	computer      *computer.Service
	modelList     *modellist.Service
	memory        *memory.Service
	agentMgr      *agentmanager.Manager
	piAuth        *piauth.Store
	settingsPath  string

	agentLifecycleCtx context.Context
	serverCtx         context.Context

	// relayClient owns the relay connection state (internal/relay).
	relayClient *relay.Client

	// piSessions owns the pi agent session registry (maps + mutexes live in
	// internal/agent/session); the services only coordinate through it.
	piSessions *session.Registry

	// desktopConns tracks live WebSocket connections tagged as the Yishan
	// desktop app (client=desktop). Used to decide how task runs attached to
	// workspace creation execute: agent chat tab when a desktop UI is
	// connected, pi CLI terminal otherwise (headless/remote daemons).
	desktopConnsMu sync.Mutex
	desktopConns   map[*rpc.Connection]struct{}

	agentUsageMu sync.Mutex
	agentUsage   map[string]map[string]struct{}

	// remoteStreamSubs tracks desktop connections subscribed to remote
	// terminal PTY streams (terminal.remote.subscribe).
	remoteStreamMu   sync.Mutex
	remoteStreamSubs map[string]map[*rpc.Connection]struct{}
}

// NewServices builds the rpc service layer for a composed app: it wires the
// workspace application service and the handler-level state. The router and
// rpc server are built by BuildRPCLayer (needs the router before terminal
// subscriptions can be wired).
func NewServices(app *App) *Services {
	services := &Services{
		nodeApp:           app,
		manager:           app.Manager,
		runtime:           app.Runtime,
		localDatabase:     app.Database,
		nodeID:            app.NodeID,
		logFilePath:       app.LogFilePath,
		cleanupStore:      app.CleanupStore,
		context:           app.ContextStore,
		events:            app.Events,
		watchers:          app.Watchers,
		prTracker:         app.PRTracker,
		tokenUsage:        app.TokenUsage,
		computer:          app.Computer,
		modelList:         app.ModelList,
		memory:            app.Memory,
		agentMgr:          app.AgentMgr,
		piAuth:            app.PIAuth,
		settingsPath:      app.SettingsPath,
		agentLifecycleCtx: app.AgentLifecycleCtx,
		serverCtx:         app.ServerCtx,
		piSessions:        session.NewRegistry(),
		desktopConns:      make(map[*rpc.Connection]struct{}),
		remoteStreamSubs:  make(map[string]map[*rpc.Connection]struct{}),
		agentUsage:        make(map[string]map[string]struct{}),
	}
	if services.agentLifecycleCtx == nil {
		services.agentLifecycleCtx = context.Background()
	}
	if services.serverCtx == nil {
		services.serverCtx = context.Background()
	}
	services.app = services.newWorkspaceApplicationService()
	return services
}

// BuildRPCLayer builds the namespace router and the rpc server around the
// services. The app must set Services first.
func (s *Services) BuildRPCLayer() {
	s.router = buildNamespaceRouter(s)
	s.rpcServer = rpc.NewServer(s)
	s.rpcServer.BinaryFrameHandler = s

	// Terminal lifecycle events flow into the frontend event hub.
	s.manager.Terminals().SetPortsChangedListener(func(ports []workspace.TerminalDetectedPort) {
		s.events.Publish(internalevents.Event{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	s.manager.Terminals().SetSessionsChangedListener(func(event workspace.TerminalSessionLifecycleEvent) {
		s.events.Publish(internalevents.Event{
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
}

// RPCServer exposes the rpc server for the daemon process layer.
func (s *Services) RPCServer() *rpc.Server {
	return s.rpcServer
}

// Router exposes the namespace router (test injection, diagnostics).
func (s *Services) Router() *rpc.Router {
	return s.router
}

// SetRelayClient attaches the relay client after it is built (needs the rpc
// server). The daemon process layer owns relay enablement.
func (s *Services) SetRelayClient(client *relay.Client) {
	s.relayClient = client
}

// RelayClient exposes the relay client (test injection).
func (s *Services) RelayClient() *relay.Client {
	return s.relayClient
}

// Call implements rpc.Handler: routes the method through the namespace router.
func (s *Services) Call(ctx context.Context, connection *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, connection, method, params)
}

// OnConnect implements rpc.ConnectionHandler: desktop clients are tracked so
// task-run execution can prefer the agent chat tab over a pi CLI terminal.
func (s *Services) OnConnect(connection *rpc.Connection, request *http.Request) {
	if request.URL.Query().Get("client") != "desktop" {
		return
	}
	s.desktopConnsMu.Lock()
	s.desktopConns[connection] = struct{}{}
	s.desktopConnsMu.Unlock()
	connection.AddCloseHook(func() {
		s.desktopConnsMu.Lock()
		delete(s.desktopConns, connection)
		s.desktopConnsMu.Unlock()
	})
}

// HandleBinaryFrame implements rpc.BinaryFrameHandler: terminal I/O frames are
// forwarded to a remote node when the session is remote, or written to the
// local PTY directly.
func (s *Services) HandleBinaryFrame(connection *rpc.Connection, opcode byte, sessionID string, payload []byte) {
	switch opcode {
	case binOpcodeTerminalInput:
		if s.forwardRemoteTerminalInput(sessionID, payload) {
			return
		}
		// Write raw bytes directly to PTY — avoids JSON unmarshal + string conversion.
		inputData := terminalInputData(payload)
		if len(inputData) == 0 {
			return
		}
		s.manager.Terminals().SendRaw(sessionID, inputData)
	case binOpcodeTerminalOutput:
		s.forwardRemoteTerminalOutput(sessionID, payload)
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

// SetComputerService replaces the computer-use service (test injection).
func (s *Services) SetComputerService(svc *computer.Service) {
	if svc == nil {
		return
	}
	s.computer = svc
}
