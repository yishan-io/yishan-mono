package session

import (
	"context"
	"time"

	"yishan/apps/cli/internal/agent/process"
)

type ProcessManager interface {
	Session(id string) (*process.Session, bool)
	Starting(id string) bool
}

// WaitForStart waits for a manager-visible process to receive registry
// metadata. The manager is checked twice around Starting so its transition
// from reserved to visible cannot be observed as absent.
func (r *Registry) WaitForStart(ctx context.Context, pm ProcessManager, sessionID string) bool {
	timeout := time.NewTimer(2 * time.Second)
	defer timeout.Stop()
	for {
		r.mu.Lock()
		state := r.sessions[sessionID]
		changed := r.changed
		r.mu.Unlock()

		proc, isLive := pm.Session(sessionID)
		if state != nil && isLive && state.Process == proc {
			return true
		}
		if !isLive && !pm.Starting(sessionID) {
			// A manager start can publish the session after Session and before
			// Starting. Re-read while both states are expected to be stable.
			if _, isLive = pm.Session(sessionID); !isLive {
				return false
			}
		}
		select {
		case <-changed:
		case <-ctx.Done():
			return false
		case <-timeout.C:
			return false
		}
	}
}

// WaitForStop waits for a completed stop only when no newer manager
// generation is visible or reserved. A completed result belongs to the exact
// process generation that produced it; replacement starts retire it.
func (r *Registry) WaitForStop(ctx context.Context, pm ProcessManager, sessionID string) bool {
	timeout := time.NewTimer(2 * time.Second)
	defer timeout.Stop()
	for {
		state, result, completed, hasCompleted, changed := r.stopStatus(sessionID)
		if result != nil {
			if !waitForStopClaim(ctx, result) {
				return false
			}
			continue
		}
		liveProcess, isLive, isStarting := managerStopState(pm, sessionID)
		isComplete, isInvalid := r.completedStopOutcome(state, completed, hasCompleted, liveProcess, isLive, isStarting)
		if isInvalid {
			return false
		}
		if isComplete {
			return true
		}
		if !waitForRegistryChange(ctx, changed, timeout.C) {
			return false
		}
	}
}

func (r *Registry) stopStatus(sessionID string) (*Session, *stopResult, completedStop, bool, <-chan struct{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pruneCompletedStopsLocked(time.Now())
	state := r.sessions[sessionID]
	var result *stopResult
	if state != nil {
		result = r.stops[stopKey{sessionID: sessionID, generation: state.generation}]
	}
	completed, hasCompleted := r.completedStops[sessionID]
	return state, result, completed, hasCompleted, r.changed
}

func waitForStopClaim(ctx context.Context, result *stopResult) bool {
	select {
	case <-result.done:
		return result.err == nil
	case <-ctx.Done():
		return false
	}
}

func managerStopState(pm ProcessManager, sessionID string) (*process.Session, bool, bool) {
	liveProcess, isLive := pm.Session(sessionID)
	isStarting := pm.Starting(sessionID)
	if !isLive && !isStarting {
		liveProcess, isLive = pm.Session(sessionID)
		isStarting = pm.Starting(sessionID)
	}
	return liveProcess, isLive, isStarting
}

func (r *Registry) completedStopOutcome(state *Session, completed completedStop, hasCompleted bool, liveProcess *process.Session, isLive bool, isStarting bool) (bool, bool) {
	if !hasCompleted {
		return false, false
	}
	isReplacement := (state != nil && state.generation != completed.key.generation) || isStarting || (isLive && liveProcess != completed.process)
	if isReplacement {
		r.retireCompletedStop(completed.key.sessionID, completed)
		return false, true
	}
	return state == nil && !isLive && !isStarting, false
}

func waitForRegistryChange(ctx context.Context, changed <-chan struct{}, timeout <-chan time.Time) bool {
	select {
	case <-changed:
		return true
	case <-ctx.Done():
		return false
	case <-timeout:
		return false
	}
}

func (r *Registry) retireCompletedStop(sessionID string, completed completedStop) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.completedStops[sessionID] == completed {
		delete(r.completedStops, sessionID)
		r.signalLocked()
	}
}
