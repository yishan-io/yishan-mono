package node

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/contextstore"
	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/memory"
	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/node/hook"
	nodesystem "yishan/apps/cli/internal/node/system"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/relay"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"

	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
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

	// Usage tracks which agents ran per workspace (close-time summarization);
	// owned by the hook package. Shared with the workspace application service.
	Usage *hook.UsageTracker

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

	// router is the namespace routing table, built by the composition root
	// (internal/app) and injected via SetRouter.
	router *rpc.Router

	// relayClient owns the relay connection state (internal/relay).
	relayClient *relay.Client

	// hookIngress handles the agent hook HTTP ingress (pi notify bridge).
	hookIngress *hook.Ingress
	// agentUsage tracks which agents ran per workspace (close-time
	// summarization); owned by the hook package.
	agentUsage *hook.UsageTracker

	// agentSvc is the agent application service: pi session state, desktop
	// connection tracking, and task runs delegate to it.
	agentSvc *nodeagent.Service

	// terminalSvc is the terminal application service: relay-level terminal
	// messages (session changes, remote stream notifications) delegate to it.
	terminalSvc *nodeterminal.Service

	// workspaceSvc is the workspace application service: relay-level
	// workspace snapshot changes delegate to it.
	workspaceSvc *nodeworkspace.Service
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
		deps: deps,
	}
	if deps.Usage == nil {
		deps.Usage = hook.NewUsageTracker()
	}
	service.agentUsage = deps.Usage
	service.hookIngress = hook.NewIngress(hook.IngressDeps{
		Events:     deps.Events,
		TokenUsage: deps.TokenUsage,
		Memory:     deps.Memory,
		Registry:   deps.Registry,
		Usage:      service.agentUsage,
	})
	return service
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
	s.agentSvc.TrackDesktop(connection)
	connection.AddCloseHook(func() {
		s.agentSvc.UntrackDesktop(connection)
	})
}

// HandleBinaryFrame implements rpc.BinaryFrameHandler for the terminal I/O
// fast-path, delegating to the terminal application service.
func (s *Service) HandleBinaryFrame(connection *rpc.Connection, opcode byte, sessionID string, payload []byte) {
	s.terminalSvc.HandleBinaryFrame(connection, opcode, sessionID, payload)
}

// HandleRelayMessage implements relay.MessageHandler: job dispatch and
// workspace snapshot changes stay on the node boundary; terminal messages
// delegate to the terminal application service.
func (s *Service) HandleRelayMessage(ctx context.Context, connState *rpc.Connection, nodeID string, method string, params json.RawMessage) bool {
	switch method {
	case relay.MethodJobRun:
		nodesystem.HandleJobRun(s.deps.Runtime, connState, nodeID, params)
		return true
	case relay.MethodWorkspaceSnapshotChanged:
		if s.workspaceSvc != nil {
			return s.workspaceSvc.HandleRelayMessage(ctx, connState, nodeID, method, params)
		}
		return false
	default:
		if s.terminalSvc != nil {
			return s.terminalSvc.HandleRelayMessage(ctx, connState, nodeID, method, params)
		}
		return false
	}
}

// SetTerminalService attaches the terminal application service (relay
// delegation, binary frames).
func (s *Service) SetTerminalService(svc *nodeterminal.Service) {
	s.terminalSvc = svc
}

// SetAgentService attaches the agent application service (pi sessions, task
// runs, desktop connection tracking).
func (s *Service) SetAgentService(svc *nodeagent.Service) {
	s.agentSvc = svc
}

// SetWorkspaceService attaches the workspace application service (relay
// workspace snapshot changes).
func (s *Service) SetWorkspaceService(svc *nodeworkspace.Service) {
	s.workspaceSvc = svc
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
