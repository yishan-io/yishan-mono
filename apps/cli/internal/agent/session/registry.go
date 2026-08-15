// Package session owns the daemon's pi agent session registry: the live
// session map, the stopping markers, and the concurrency rules (start/attach/
// stop coordination). Agent process lifecycle (spawning, stdin, exit events)
// lives in internal/agent/process.
package session

import (
	"context"
	"sync"
	"time"

	"yishan/apps/cli/internal/agent/process"
)

// piStopWaitTimeout bounds how long pi.start waits for an in-flight pi.stop of
// the same session id before giving up and reporting ErrSessionExists.
const piStopWaitTimeout = 10 * time.Second

// stoppingMarkGracePeriod is how long pi.start waits to observe the stopping
// marker before concluding the session is a genuinely live session (not being
// torn down) and giving up on the wait. The marker is set microseconds after
// the pi.stop RPC arrives, so a short grace is ample.
const stoppingMarkGracePeriod = 150 * time.Millisecond

// attachStartWaitTimeout bounds how long pi.attach waits for a concurrent
// pi.start of the same session id to finish spawning.
const attachStartWaitTimeout = 2 * time.Second

// SessionConnection is the transport connection a session's events are
// forwarded to. rpc.Connection implements it; the session domain depends on
// this interface so it never imports the rpc transport.
type SessionConnection interface {
	// Notify sends a server-initiated notification to the connection.
	Notify(method string, params any) error
	// IsOpen reports whether the underlying transport is still open.
	IsOpen() bool
}

// Session is the daemon-side metadata for one live pi session: the process,
// the desktop connection bound to it, and the recovery metadata.
type Session struct {
	Conn        SessionConnection
	Process     *process.Session
	TabID       string
	WorkspaceID string
	CWD         string
	// TaskRun marks sessions started by a workspace-create task run. When such
	// a session exits before any client attaches, pi.start fails closed instead
	// of spawning a fresh idle twin that silently loses the task.
	TaskRun bool
}

// ProcessManager is the subset of the agent process manager the registry needs
// to coordinate start/stop races.
type ProcessManager interface {
	Session(id string) (*process.Session, bool)
	Starting(id string) bool
}

// Registry owns the pi session map and the stopping markers. All access is
// synchronized; handlers never touch the maps directly.
type Registry struct {
	mu       sync.Mutex
	sessions map[string]*Session
	stopping map[string]struct{}
}

// NewRegistry creates an empty pi session registry.
func NewRegistry() *Registry {
	return &Registry{
		sessions: make(map[string]*Session),
		stopping: make(map[string]struct{}),
	}
}

// Get returns the session metadata for an id.
func (r *Registry) Get(sessionID string) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, exists := r.sessions[sessionID]
	return state, exists
}

// Register inserts a fresh session.
func (r *Registry) Register(sessionID string, conn SessionConnection, proc *process.Session, tabID string, workspaceID string, cwd string, taskRun bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[sessionID] = &Session{
		Conn:        conn,
		Process:     proc,
		TabID:       tabID,
		WorkspaceID: workspaceID,
		CWD:         cwd,
		TaskRun:     taskRun,
	}
}

// Attach rebinds an existing session to a (possibly reconnected) connection
// and overlays optional recovery metadata.
func (r *Registry) Attach(sessionID string, conn SessionConnection, tabID string, workspaceID string, cwd string) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, exists := r.sessions[sessionID]
	if !exists {
		return nil, false
	}
	state.Conn = conn
	if tabID != "" {
		state.TabID = tabID
	}
	if workspaceID != "" {
		state.WorkspaceID = workspaceID
	}
	if cwd != "" {
		state.CWD = cwd
	}
	return state, true
}

// SetProcess replaces the process handle for a session (used by recovery tests
// and the task-run fail-closed guard).
func (r *Registry) SetProcess(sessionID string, proc *process.Session) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if state, exists := r.sessions[sessionID]; exists {
		state.Process = proc
	}
}

// Delete removes a session and any stopping marker.
func (r *Registry) Delete(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, sessionID)
	delete(r.stopping, sessionID)
}

// MarkStopping flags the session as mid-teardown so concurrent start/attach
// cannot bind to a dying process. Reports whether the session exists.
func (r *Registry) MarkStopping(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.sessions[sessionID]; !exists {
		return false
	}
	r.stopping[sessionID] = struct{}{}
	return true
}

// UnmarkStopping clears a stopping marker.
func (r *Registry) UnmarkStopping(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.stopping, sessionID)
}

// IsStopping reports whether the session is mid-teardown.
func (r *Registry) IsStopping(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, stopping := r.stopping[sessionID]
	return stopping
}

// Lookup returns the session bound to the given process (nil when absent).
func (r *Registry) Lookup(proc *process.Session) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, exists := r.sessions[proc.ID()]
	if !exists || state.Process != proc {
		return nil, false
	}
	return state, true
}

// Snapshot returns a copy of the live session map for iteration.
func (r *Registry) Snapshot() map[string]*Session {
	r.mu.Lock()
	defer r.mu.Unlock()
	snapshot := make(map[string]*Session, len(r.sessions))
	for id, state := range r.sessions {
		snapshot[id] = state
	}
	return snapshot
}

// WaitForStopping blocks while the given session id is being torn down by an
// in-flight pi.stop, so a concurrent pi.start can reuse the id as soon as it is
// released. It returns true once the session has been released (or is already
// absent). It returns false without waiting when the session is never marked as
// stopping (a genuinely live session) or when the context is done or the wait
// times out — the caller then reports ErrSessionExists.
func (r *Registry) WaitForStopping(ctx context.Context, pm ProcessManager, sessionID string) bool {
	startedAt := time.Now()
	deadline := startedAt.Add(piStopWaitTimeout)
	sawStopping := false
	for {
		sawStopping = sawStopping || r.IsStopping(sessionID)

		if _, exists := pm.Session(sessionID); !exists {
			return true // released (mid-stop teardown finished, or already absent)
		}
		// The session still exists but was never marked as stopping: it is a
		// live session, not a teardown — stop waiting so the caller reports
		// ErrSessionExists and the frontend attaches to it.
		if !sawStopping && time.Since(startedAt) > stoppingMarkGracePeriod {
			return false
		}
		if time.Now().After(deadline) {
			return sawStopping
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// WaitForStart polls until the given session id is fully registered (spawned
// in the process manager and present in the registry) — i.e. a concurrent
// pi.start finished. It only waits while a start for the id is genuinely in
// flight and returns false when the id is not being started, the context is
// done, or the wait times out.
func (r *Registry) WaitForStart(ctx context.Context, pm ProcessManager, sessionID string) bool {
	deadline := time.Now().Add(attachStartWaitTimeout)
	for {
		if r.FullyRegistered(pm, sessionID) {
			return true
		}
		if !pm.Starting(sessionID) {
			// The winner may have completed its register-and-release between our
			// two reads; do one final check before declaring the session absent.
			return r.FullyRegistered(pm, sessionID)
		}
		if time.Now().After(deadline) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// FullyRegistered reports whether the session is both spawned in the process
// manager and registered in the registry. The registry write happens just after
// the spawn, so an attach must wait for both.
func (r *Registry) FullyRegistered(pm ProcessManager, sessionID string) bool {
	if _, exists := pm.Session(sessionID); !exists {
		return false
	}
	_, exists := r.Get(sessionID)
	return exists
}
