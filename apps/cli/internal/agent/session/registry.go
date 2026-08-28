// Package session owns the daemon's Pi agent session registry and coordinates
// session admission with workspace cleanup.
package session

import (
	"context"
	"errors"
	"sync"
	"time"

	"yishan/apps/cli/internal/agent/process"
)

var (
	ErrWorkspaceClosing  = errors.New("workspace is closing")
	ErrWorkspaceMismatch = errors.New("pi session belongs to a different workspace")
	ErrSessionStopping   = errors.New("pi session is stopping")
	ErrSessionNotLive    = errors.New("pi session is no longer live")
)

type SessionConnection interface {
	Notify(method string, params any) error
	IsOpen() bool
}

// Session is daemon metadata for one Pi process. WorkspaceID is immutable after
// admission.
type Session struct {
	Conn        SessionConnection
	Process     *process.Session
	TabID       string
	WorkspaceID string
	CWD         string
	TaskRun     bool
	generation  uint64
	state       workspaceState
}

type admission struct {
	workspaceID string
	isConsumed  bool
}
type Admission struct{ state *admission }

type workspaceState uint8

const (
	workspaceClosing workspaceState = iota + 1
	workspaceCommitted
)

type workspaceCleanup struct {
	workspaceID string
	generation  uint64
	state       workspaceState
}

// WorkspaceCleanup identifies one close attempt. Its token prevents an older
// close attempt from reopening or committing a later attempt.
type WorkspaceCleanup struct{ state workspaceCleanup }

// WorkspaceID returns the workspace identified by this opaque cleanup handle.
func (c *WorkspaceCleanup) WorkspaceID() string {
	if c == nil {
		return ""
	}
	return c.state.workspaceID
}

type stopKey struct {
	sessionID  string
	generation uint64
}

type stopResult struct {
	done chan struct{}
	err  error
}

const (
	completedStopRetention = 10 * time.Second
	maxCompletedStops      = 256
)

type completedStop struct {
	key         stopKey
	process     *process.Session
	completedAt time.Time
}

// StopClaim serializes a stop for exactly one session generation.
type StopClaim struct {
	sessionID  string
	generation uint64
	process    *process.Session
	result     *stopResult
	owner      bool
}

func (c *StopClaim) IsOwner() bool             { return c.owner }
func (c *StopClaim) SessionID() string         { return c.sessionID }
func (c *StopClaim) Process() *process.Session { return c.process }
func (c *StopClaim) Wait(ctx context.Context) error {
	select {
	case <-c.result.done:
		return c.result.err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Registry owns all mutable Pi session coordination state.
type Registry struct {
	mu               sync.Mutex
	sessions         map[string]*Session
	stops            map[stopKey]*stopResult
	completedStops   map[string]completedStop
	workspaces       map[string]workspaceCleanup
	admissions       map[string]int
	cleanupFailures  map[string]error
	nextGeneration   uint64
	nextCleanupToken uint64
	changed          chan struct{}

	// afterWorkspaceCleanupMarkerInstalled coordinates focused overlap tests.
	afterWorkspaceCleanupMarkerInstalled func()
}

// SetAfterWorkspaceCleanupMarkerInstalledForTest installs a focused-test hook
// that runs after cleanup blocks new workspace admissions.
func (r *Registry) SetAfterWorkspaceCleanupMarkerInstalledForTest(hook func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.afterWorkspaceCleanupMarkerInstalled = hook
}

func NewRegistry() *Registry {
	return &Registry{
		sessions:        make(map[string]*Session),
		stops:           make(map[stopKey]*stopResult),
		completedStops:  make(map[string]completedStop),
		workspaces:      make(map[string]workspaceCleanup),
		admissions:      make(map[string]int),
		cleanupFailures: make(map[string]error),
		changed:         make(chan struct{}),
	}
}

func cloneSession(state *Session) *Session {
	if state == nil {
		return nil
	}
	clone := *state
	return &clone
}

func (r *Registry) signalLocked() {
	close(r.changed)
	r.changed = make(chan struct{})
}

func (r *Registry) workspaceBlocksAdmissionLocked(workspaceID string) bool {
	_, exists := r.workspaces[workspaceID]
	return exists
}

func (r *Registry) Admit(workspaceID string) (*Admission, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.workspaceBlocksAdmissionLocked(workspaceID) {
		return nil, ErrWorkspaceClosing
	}
	r.admissions[workspaceID]++
	return &Admission{state: &admission{workspaceID: workspaceID}}, nil
}

func (r *Registry) RegisterAdmission(admission *Admission, sessionID string, conn SessionConnection, proc *process.Session, tabID, cwd string, taskRun bool) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if admission == nil || admission.state == nil {
		return false
	}
	workspaceID := admission.state.workspaceID
	if r.workspaceBlocksAdmissionLocked(workspaceID) {
		return false
	}
	if !r.consumeAdmissionLocked(admission) {
		return false
	}
	r.sessions[sessionID] = r.newSessionLocked(conn, proc, tabID, workspaceID, cwd, taskRun)
	delete(r.completedStops, sessionID)
	r.signalLocked()
	return true
}

// RejectAdmission releases a rejected start. If stopping the crossing process
// failed, it becomes a registered cleanup claim so a future close can retry it.
func (r *Registry) RejectAdmission(admission *Admission, sessionID string, conn SessionConnection, proc *process.Session, tabID, cwd string, taskRun bool, err error) {
	if admission == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if admission.state == nil || !r.consumeAdmissionLocked(admission) {
		return
	}
	workspaceID := admission.state.workspaceID
	if err != nil {
		r.cleanupFailures[workspaceID] = errors.Join(r.cleanupFailures[workspaceID], err)
		r.sessions[sessionID] = r.newSessionLocked(conn, proc, tabID, workspaceID, cwd, taskRun)
	}
}

func (r *Registry) ReleaseAdmission(admission *Admission) {
	if admission == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if admission.state != nil {
		r.consumeAdmissionLocked(admission)
	}
}

func (r *Registry) consumeAdmissionLocked(admission *Admission) bool {
	if admission.state.isConsumed {
		return false
	}
	admission.state.isConsumed = true
	r.releaseAdmissionLocked(admission.state.workspaceID)
	return true
}

func (r *Registry) releaseAdmissionLocked(workspaceID string) {
	if r.admissions[workspaceID] > 1 {
		r.admissions[workspaceID]--
		return
	}
	delete(r.admissions, workspaceID)
	r.signalLocked()
}

// BeginWorkspaceCleanup starts a close attempt and returns the opaque handle
// that must be supplied to its later abort or commit.
func (r *Registry) BeginWorkspaceCleanup(ctx context.Context, workspaceID string) (*WorkspaceCleanup, []*StopClaim, error) {
	r.mu.Lock()
	cleanup := r.beginCleanupLocked(workspaceID)
	markerInstalled := r.afterWorkspaceCleanupMarkerInstalled
	r.mu.Unlock()
	if markerInstalled != nil {
		markerInstalled()
	}
	r.mu.Lock()
	for r.admissions[workspaceID] != 0 {
		changed := r.changed
		r.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return cleanup, nil, ctx.Err()
		}
		r.mu.Lock()
	}
	// A failed crossing stop is itself registered for this cleanup. Keep
	// claiming every matching session so this attempt can retry it and report
	// all failures together.
	failure := r.cleanupFailures[workspaceID]
	claims := r.claimWorkspaceStopsLocked(workspaceID)
	r.mu.Unlock()
	return cleanup, claims, failure
}

func (r *Registry) beginCleanupLocked(workspaceID string) *WorkspaceCleanup {
	current, exists := r.workspaces[workspaceID]
	if !exists || current.generation == 0 {
		r.nextCleanupToken++
		current = workspaceCleanup{workspaceID: workspaceID, generation: r.nextCleanupToken, state: workspaceClosing}
		r.workspaces[workspaceID] = current
		r.signalLocked()
	}
	return &WorkspaceCleanup{state: current}
}

func (r *Registry) claimWorkspaceStopsLocked(workspaceID string) []*StopClaim {
	claims := make([]*StopClaim, 0)
	for sessionID, state := range r.sessions {
		if state.WorkspaceID == workspaceID {
			claims = append(claims, r.claimStopLocked(sessionID, state))
		}
	}
	return claims
}

// AbortWorkspaceCleanup reopens only the cleanup attempt identified by handle.
func (r *Registry) AbortWorkspaceCleanup(cleanup *WorkspaceCleanup) bool {
	if cleanup == nil {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	current, exists := r.workspaces[cleanup.state.workspaceID]
	if !exists || current != cleanup.state || current.state == workspaceCommitted {
		return false
	}
	delete(r.workspaces, cleanup.state.workspaceID)
	delete(r.cleanupFailures, cleanup.state.workspaceID)
	r.signalLocked()
	return true
}

// CommitWorkspaceCleanup commits only the cleanup attempt identified by handle.
func (r *Registry) CommitWorkspaceCleanup(cleanup *WorkspaceCleanup) bool {
	if cleanup == nil {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	current, exists := r.workspaces[cleanup.state.workspaceID]
	if !exists || current != cleanup.state || current.state == workspaceCommitted {
		return false
	}
	current.state = workspaceCommitted
	r.workspaces[cleanup.state.workspaceID] = current
	r.signalLocked()
	return true
}

func (r *Registry) Get(sessionID string) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.sessions[sessionID]
	return cloneSession(state), ok
}

// Register is retained for test setup. Production starts must use admission.
func (r *Registry) Register(sessionID string, conn SessionConnection, proc *process.Session, tabID, workspaceID, cwd string, taskRun bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[sessionID] = r.newSessionLocked(conn, proc, tabID, workspaceID, cwd, taskRun)
	delete(r.completedStops, sessionID)
	r.signalLocked()
}

func (r *Registry) Attach(sessionID string, conn SessionConnection, tabID, workspaceID, cwd string) (*Session, error) {
	return r.attach(sessionID, conn, tabID, workspaceID, cwd, nil, false)
}

// AttachLive attaches only when registry metadata belongs to the manager's
// current process generation.
func (r *Registry) AttachLive(pm ProcessManager, sessionID string, conn SessionConnection, tabID, workspaceID, cwd string) (*Session, error) {
	return r.attach(sessionID, conn, tabID, workspaceID, cwd, pm, false)
}

// AttachLiveOwned attaches only when the live session's immutable workspace and
// working directory match the resolved workspace supplied by an agent.* call.
func (r *Registry) AttachLiveOwned(pm ProcessManager, sessionID string, conn SessionConnection, tabID, workspaceID, cwd string) (*Session, error) {
	return r.attach(sessionID, conn, tabID, workspaceID, cwd, pm, true)
}

func (r *Registry) attach(sessionID string, conn SessionConnection, tabID, workspaceID, cwd string, pm ProcessManager, requireCWDMatch bool) (*Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, exists := r.sessions[sessionID]
	if !exists {
		return nil, nil
	}
	if pm != nil {
		proc, isLive := pm.Session(sessionID)
		if !isLive || proc != state.Process {
			return nil, ErrSessionNotLive
		}
	}
	if r.workspaceBlocksAdmissionLocked(state.WorkspaceID) {
		return nil, ErrWorkspaceClosing
	}
	if workspaceID != "" && workspaceID != state.WorkspaceID {
		return nil, ErrWorkspaceMismatch
	}
	if requireCWDMatch && cwd != state.CWD {
		return nil, ErrWorkspaceMismatch
	}
	if _, stopping := r.stops[stopKey{sessionID: sessionID, generation: state.generation}]; stopping {
		return nil, ErrSessionStopping
	}
	state.Conn = conn
	if tabID != "" {
		state.TabID = tabID
	}
	if cwd != "" {
		state.CWD = cwd
	}
	return cloneSession(state), nil
}

func (r *Registry) SetProcess(sessionID string, proc *process.Session) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if state := r.sessions[sessionID]; state != nil {
		state.Process = proc
	}
}

func (r *Registry) waitChange() <-chan struct{} {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.changed
}

func (r *Registry) Delete(sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, sessionID)
	r.signalLocked()
}

func (r *Registry) IsStopping(sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.sessions[sessionID]
	if state == nil {
		return false
	}
	_, exists := r.stops[stopKey{sessionID: sessionID, generation: state.generation}]
	return exists
}

func (r *Registry) ClaimStop(sessionID string) (*StopClaim, *Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, exists := r.sessions[sessionID]
	if !exists {
		return nil, nil, false
	}
	return r.claimStopLocked(sessionID, state), cloneSession(state), true
}

func (r *Registry) claimStopLocked(sessionID string, state *Session) *StopClaim {
	key := stopKey{sessionID: sessionID, generation: state.generation}
	result, exists := r.stops[key]
	if !exists {
		result = &stopResult{done: make(chan struct{})}
		r.stops[key] = result
		r.signalLocked()
	}
	return &StopClaim{sessionID: sessionID, generation: state.generation, process: state.Process, result: result, owner: !exists}
}

func (r *Registry) CompleteStop(claim *StopClaim, err error) {
	if claim == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	key := stopKey{sessionID: claim.sessionID, generation: claim.generation}
	result := r.stops[key]
	if result != claim.result {
		return
	}
	result.err = err
	if err == nil {
		if state := r.sessions[claim.sessionID]; state != nil && state.generation == claim.generation {
			delete(r.sessions, claim.sessionID)
		}
		now := time.Now()
		completed := completedStop{key: key, process: claim.process, completedAt: now}
		r.completedStops[claim.sessionID] = completed
		r.pruneCompletedStopsLocked(now)
		r.scheduleCompletedStopExpiry(claim.sessionID, completed)
	}
	delete(r.stops, key)
	close(result.done)
	r.signalLocked()
}

func (r *Registry) Lookup(proc *process.Session) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.sessions[proc.ID()]
	if !ok || state.Process != proc {
		return nil, false
	}
	return cloneSession(state), true
}

func (r *Registry) Snapshot() map[string]*Session {
	r.mu.Lock()
	defer r.mu.Unlock()
	snapshot := make(map[string]*Session, len(r.sessions))
	for sessionID, state := range r.sessions {
		snapshot[sessionID] = cloneSession(state)
	}
	return snapshot
}

func (r *Registry) newSessionLocked(conn SessionConnection, proc *process.Session, tabID, workspaceID, cwd string, taskRun bool) *Session {
	r.nextGeneration++
	return &Session{Conn: conn, Process: proc, TabID: tabID, WorkspaceID: workspaceID, CWD: cwd, TaskRun: taskRun, generation: r.nextGeneration}
}
