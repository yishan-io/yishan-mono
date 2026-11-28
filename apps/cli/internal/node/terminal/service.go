// Package terminal is the Node application service for the terminal.* RPC
// namespace: local terminal session operations and the binary terminal I/O
// fast-path. It
// receives a small dependency set and never imports the composition root or
// the daemon.
package terminal

import (
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/events"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
)

// Binary frame opcodes for terminal I/O live in the shared relay protocol
// module (relayprotocol.BinaryFrameOpcodeInput / BinaryFrameOpcodeOutput).

// Deps are the explicit dependencies of the terminal application service.
type Deps struct {
	// Workspace resolves workspace-scoped handles for terminal sessions.
	Workspace *nodeworkspace.Service
	Terminals *term.Manager
	Events    *eventbus.Hub
	Session   *session.Session
	NodeID    string
}

// Service implements the terminal.* RPC namespace. Each method is named after the wire
// method tail; the service type already carries the namespace.
type Service struct {
	deps Deps

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the terminal application service and wires terminal
// lifecycle events into the frontend event hub.
func NewService(deps Deps) *Service {
	service := &Service{deps: deps}
	WireTerminalListeners(deps.Terminals, deps.Events)
	return service
}

// WireTerminalListeners forwards terminal lifecycle events into the frontend
// event hub. Exported so test harnesses that construct services directly can
// wire the same glue the composition root wires.
func WireTerminalListeners(terminals *term.Manager, events *eventbus.Hub) {
	if terminals == nil || events == nil {
		return
	}
	terminals.SetPortsChangedListener(func(ports []term.DetectedPort) {
		events.Publish(eventbus.Event{
			Topic: "terminalDetectedPortsChanged",
			Payload: map[string]any{
				"ports": ports,
			},
		})
	})
	terminals.SetSessionsChangedListener(func(event term.SessionLifecycleEvent) {
		events.Publish(eventbus.Event{
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
