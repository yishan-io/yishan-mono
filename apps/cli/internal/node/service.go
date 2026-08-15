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
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/contextstore"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/node/hook"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

const (
	// Binary frame opcodes for terminal I/O fast-path.
	binOpcodeTerminalInput  byte = 0x01
	binOpcodeTerminalOutput byte = 0x02
)

// Dependencies are the explicit domain and capability services the local
// Node application boundary operates on. The composition root (internal/app)
// builds these and constructs the Service; the Service never reaches into the
// composition root.
type Dependencies struct {
	Registry  *instance.Registry
	Store     workspace.WorkspaceStore
	Files     *files.FileService
	Git       *git.GitService
	Terminals *terminal.Manager

	Memory       *memory.Service
	Computer     *computer.Service
	ModelList    *modellist.Service
	AgentMgr     *agentmanager.Manager
	PIAuth       *piauth.Store
	TokenUsage   tokenusage.Service
	Events       *internalevents.Hub
	Watchers     *workspacewatchers.Watchers
	PRTracker    *workspaceprtracker.Tracker
	CleanupStore *localdb.WorkspaceCleanupStore
	ContextStore *contextstore.Store
	Database     *sql.DB
	Runtime      *cliruntime.Runtime
	NodeID       string
	LogFilePath  string
	SettingsPath string

	// AgentLifecycleCtx bounds pi agent process lifetimes.
	AgentLifecycleCtx context.Context
	// AgentLifecycleCancel cancels AgentLifecycleCtx (daemon shutdown).
	AgentLifecycleCancel context.CancelFunc
	// ServerCtx is the long-lived context RPC handlers use for server-side
	// work (memory searches, relayed creates).
	ServerCtx context.Context
}

// Service is the local Node application boundary: the concrete implementation
// of the rpc namespace service interfaces (workspace/file/git/terminal/
// memory/computer/context/project/system/agent) and the application
// operations a local Node provides (workspace open/close/hydrate, persistence,
// health, watcher registration). It is constructed from explicit Dependencies
// by the composition root and injected into the rpc namespace handlers. It
// never imports internal/app.
//
// Service owns the mutable handler-level state that is neither transport
// (rpc.Server) nor domain (session.Registry) owned: desktop connection
// tracking, the remote terminal stream subscriptions, and the agent-usage
// map used by hook ingress.
type Service struct {
	deps Dependencies

	// The application service for workspace create/close orchestration.
	app *application.Service

	// router is the namespace routing table, built by the composition root
	// (internal/app) and injected via SetRouter.
	router *rpc.Router

	// relayClient owns the relay connection state (internal/relay).
	relayClient *relay.Client

	// piSessions owns the pi agent session registry (maps + mutexes live in
	// internal/agent/session); the service only coordinates through it.
	piSessions *session.Registry

	// hookIngress handles the agent hook HTTP ingress (pi notify bridge).
	hookIngress *hook.Ingress
	// agentUsage tracks which agents ran per workspace (close-time
	// summarization); owned by the hook package.
	agentUsage *hook.UsageTracker

	// desktopConns tracks live WebSocket connections tagged as the Yishan
	// desktop app (client=desktop). Used to decide how task runs attached to
	// workspace creation execute: agent chat tab when a desktop UI is
	// connected, pi CLI terminal otherwise (headless/remote daemons).
	desktopConnsMu sync.Mutex
	desktopConns   map[*rpc.Connection]struct{}

	// remoteStreamSubs tracks desktop connections subscribed to remote
	// terminal PTY streams (terminal.remote.subscribe).
	remoteStreamMu   sync.Mutex
	remoteStreamSubs map[string]map[*rpc.Connection]struct{}
}

// NewService builds the local Node application boundary from explicit
// dependencies: it wires the workspace application service, the agent hook
// ingress, and the handler-level state.
func NewService(deps Dependencies) *Service {
	if deps.AgentLifecycleCtx == nil {
		deps.AgentLifecycleCtx, deps.AgentLifecycleCancel = context.WithCancel(context.Background())
	}
	if deps.ServerCtx == nil {
		deps.ServerCtx = context.Background()
	}
	service := &Service{
		deps:             deps,
		piSessions:       session.NewRegistry(),
		desktopConns:     make(map[*rpc.Connection]struct{}),
		remoteStreamSubs: make(map[string]map[*rpc.Connection]struct{}),
	}
	service.app = service.newWorkspaceApplicationService()
	service.agentUsage = hook.NewUsageTracker()
	service.hookIngress = hook.NewIngress(hook.IngressDeps{
		Events:     deps.Events,
		TokenUsage: deps.TokenUsage,
		Memory:     deps.Memory,
		Registry:   deps.Registry,
		Usage:      service.agentUsage,
	})
	service.wireTerminalListeners()
	return service
}

// wireTerminalListeners forwards terminal lifecycle events into the frontend
// event hub.
func (s *Service) wireTerminalListeners() {
	if s.deps.Terminals == nil || s.deps.Events == nil {
		return
	}
	s.deps.Terminals.SetPortsChangedListener(func(ports []terminal.DetectedPort) {
		s.deps.Events.Publish(internalevents.Event{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	s.deps.Terminals.SetSessionsChangedListener(func(event terminal.SessionLifecycleEvent) {
		s.deps.Events.Publish(internalevents.Event{
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

// SetRelayClient attaches the relay client after it is built (needs the rpc
// server). The composition root owns relay enablement.
func (s *Service) SetRelayClient(client *relay.Client) {
	s.relayClient = client
}

// RelayClient exposes the relay client (test injection).
func (s *Service) RelayClient() *relay.Client {
	return s.relayClient
}

// SetRouter attaches the namespace router built by the composition root.
func (s *Service) SetRouter(router *rpc.Router) {
	s.router = router
}

// Router exposes the namespace router (test injection, diagnostics).
func (s *Service) Router() *rpc.Router {
	return s.router
}

// Call implements rpc.Handler: routes the method through the namespace router.
func (s *Service) Call(ctx context.Context, connection *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, connection, method, params)
}

// OnConnect implements rpc.ConnectionHandler: desktop clients are tracked so
// task-run execution can prefer the agent chat tab over a pi CLI terminal.
func (s *Service) OnConnect(connection *rpc.Connection, request *http.Request) {
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
func (s *Service) HandleBinaryFrame(connection *rpc.Connection, opcode byte, sessionID string, payload []byte) {
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
		s.deps.Terminals.SendRaw(sessionID, inputData)
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
func (s *Service) SetComputerService(svc *computer.Service) {
	if svc == nil {
		return
	}
	s.deps.Computer = svc
}

// Shutdown stops the application-owned runtime: it cancels the pi agent
// lifecycle context and stops the agent manager. The composition root calls
// this as part of App.Close; tests use it to simulate daemon shutdown.
func (s *Service) Shutdown() {
	if s.deps.AgentLifecycleCancel != nil {
		s.deps.AgentLifecycleCancel()
	}
	if s.deps.AgentMgr != nil {
		s.deps.AgentMgr.StopAll()
	}
}

// ServeAgentHook handles the agent hook HTTP ingress (pi notify bridge),
// delegating to the hook ingress adapter.
func (s *Service) ServeAgentHook(w http.ResponseWriter, r *http.Request) {
	s.hookIngress.ServeHTTP(w, r)
}

// clearAgentUsage drops the recorded agents for a workspace (close-time
// cleanup).
func (s *Service) clearAgentUsage(workspaceID string) {
	s.agentUsage.Clear(workspaceID)
}

// getAgentUsage returns the agents recorded for a workspace.
func (s *Service) getAgentUsage(workspaceID string) []string {
	return s.agentUsage.List(workspaceID)
}
