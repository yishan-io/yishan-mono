// Package agent is the Node application service for the pi.*, skill.*, and
// customize.* RPC namespaces: pi session lifecycle, provider auth, skill and
// extension management, and task runs attached to workspace creation. It
// receives a small dependency set and never imports the composition root or
// the daemon.
package agent

import (
	"context"
	"sync"

	piauth "yishan/apps/cli/internal/agent/auth"
	modellist "yishan/apps/cli/internal/agent/catalog"
	"yishan/apps/cli/internal/agent/dsh"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/agent/session"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/node/context"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

// WorkspaceResolver resolves an open workspace instance by id (skill active
// workspace). The workspace application service implements it.
type WorkspaceResolver interface {
	GetWorkspace(workspaceID string) (workspace.Workspace, error)
}

// DSHSessions is the internal DSH runtime boundary used by workspace-scoped
// session operations. It is intentionally not exposed through the RPC layer.
type DSHSessions interface {
	ListSessions(context.Context, dsh.SessionListRequest) (dsh.SessionListResult, error)
	ReadSession(context.Context, dsh.SessionReadRequest) (dsh.SessionReadResult, error)
	ResumeSession(context.Context, dsh.SessionReadRequest) (dsh.SessionResumeResult, error)
	DisposeSession(context.Context, dsh.SessionReadRequest) (dsh.SessionDisposeResult, error)
}

// Deps are the explicit dependencies of the agent application service.
type Deps struct {
	// Workspace resolves workspace-scoped handles (skill active workspace).
	Workspace    WorkspaceResolver
	AgentMgr     *agentmanager.Manager
	PIAuth       *piauth.Store
	ModelList    *modellist.Service
	Events       *eventbus.Hub
	Terminals    *term.Manager
	ContextStore *contextstore.Store

	// DSH serves account-scoped DSH session operations when the feature is enabled.
	DSH DSHSessions

	// AgentLifecycleCtx bounds pi agent process lifetimes.
	AgentLifecycleCtx context.Context
	// AgentLifecycleCancel cancels AgentLifecycleCtx (daemon shutdown).
	AgentLifecycleCancel context.CancelFunc
	// ServerCtx is the long-lived context RPC handlers use for server-side
	// work.
	ServerCtx context.Context
	// DaemonWSEndpoint is injected into every Pi child process.
	DaemonWSEndpoint string

	// RelayCreateCompleted forwards a workspace-create completion to the
	// origin node via the relay; wired by the composition root.
	RelayCreateCompleted func(prepared application.CreatePlan, completed map[string]any)
}

// Service implements the pi.*, skill.*, and customize.* RPC namespaces and
// owns the pi session registry and the desktop-connection tracking used to
// decide how task runs execute. Each method is named after the wire method
// tail; the service type already carries the namespace.
type Service struct {
	deps Deps

	// piSessions owns the pi agent session registry (maps + mutexes live in
	// internal/agent/session); the service only coordinates through it.
	piSessions *session.Registry
	// stopProcess is overridden by focused tests to exercise cleanup failures.
	stopProcess func(*agentmanager.Session) error
	// afterProcessStart is a focused-test barrier for the manager/register gap.
	afterProcessStart func()
	// afterWorkspaceClaims is a focused-test barrier after workspace stop coalescing.
	afterWorkspaceClaims func()
	// afterAttachWaitForStart is a focused-test barrier before attach waits for
	// registry metadata after observing a manager-visible process.
	afterAttachWaitForStart func()
	// afterOwnedProcess is a focused-test barrier after agent.* binds a process.
	afterOwnedProcess func()
	// afterStopClaim is a focused-test barrier after pi.stop publishes its claim.
	afterStopClaim func()
	// afterStartStopConflict is a focused-test barrier after pi.start observes
	// a live process and before it waits for the published stop result.
	afterStartStopConflict func()
	// afterWorkspaceStopWaiter is a focused-test barrier for a coalesced caller.
	afterWorkspaceStopWaiter func()

	workspaceStopsMu sync.Mutex
	workspaceStops   map[string]*workspaceStop

	// desktopConns tracks live WebSocket connections tagged as the Yishan
	// desktop app (client=desktop). Used to decide how task runs attached to
	// workspace creation execute: agent chat tab when a desktop UI is
	// connected, pi CLI terminal otherwise (headless/remote daemons).
	desktopConnsMu sync.Mutex
	desktopConns   map[*rpc.Connection]struct{}

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the agent application service.
func NewService(deps Deps) *Service {
	if deps.AgentLifecycleCtx == nil {
		deps.AgentLifecycleCtx = context.Background()
	}
	return &Service{
		deps:           deps,
		piSessions:     session.NewRegistry(),
		stopProcess:    func(proc *agentmanager.Session) error { return proc.Close() },
		desktopConns:   make(map[*rpc.Connection]struct{}),
		workspaceStops: make(map[string]*workspaceStop),
	}
}

// Shutdown stops pi agent processes and marks the service as shutting down:
// pi.start is rejected afterwards. The composition root calls this as part of
// App.Close; tests use it to simulate daemon shutdown.
func (s *Service) Shutdown() {
	if s.deps.AgentLifecycleCancel != nil {
		s.deps.AgentLifecycleCancel()
	}
	if s.deps.AgentMgr != nil {
		s.deps.AgentMgr.StopAll()
	}
}

// TrackDesktop records a desktop-app connection; UntrackDesktop removes it.
// The transport connection handler delegates here.
func (s *Service) TrackDesktop(connection *rpc.Connection) {
	s.desktopConnsMu.Lock()
	s.desktopConns[connection] = struct{}{}
	s.desktopConnsMu.Unlock()
}

// UntrackDesktop removes a desktop-app connection.
func (s *Service) UntrackDesktop(connection *rpc.Connection) {
	s.desktopConnsMu.Lock()
	delete(s.desktopConns, connection)
	s.desktopConnsMu.Unlock()
}

// HasDesktopUI reports whether a Yishan desktop app connection is currently
// attached to this daemon.
func (s *Service) HasDesktopUI() bool {
	s.desktopConnsMu.Lock()
	defer s.desktopConnsMu.Unlock()
	return len(s.desktopConns) > 0
}

// DaemonWSEndpoint returns the app-owned endpoint configured for Pi children.
func (s *Service) DaemonWSEndpoint() string {
	return s.deps.DaemonWSEndpoint
}
