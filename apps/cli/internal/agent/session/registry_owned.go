package session

import "yishan/apps/cli/internal/agent/process"

// OwnedProcess identifies the exact live process generation authorized for an
// ownership-bound agent operation.
type OwnedProcess struct {
	process    *process.Session
	generation uint64
}

// Process returns the process authorized by the ownership lookup.
func (p *OwnedProcess) Process() *process.Session { return p.process }

// Generation returns the registry generation authorized by the ownership lookup.
func (p *OwnedProcess) Generation() uint64 { return p.generation }

// GetLiveOwnedProcess atomically validates immutable ownership, workspace
// cleanup state, and stop state before resolving the current process generation.
// Callers must send to the returned Process, never look up sessionID again.
func (r *Registry) GetLiveOwnedProcess(pm ProcessManager, sessionID, workspaceID, cwd string) (*OwnedProcess, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, err := r.liveOwnedStateLocked(pm, sessionID, workspaceID, cwd, true)
	if err != nil {
		return nil, err
	}
	return &OwnedProcess{process: state.Process, generation: state.generation}, nil
}

// ClaimOwnedStop atomically validates immutable ownership and claims a stop
// for the same process generation. It deliberately joins an in-progress stop
// so agent.dispose callers share its result.
func (r *Registry) ClaimOwnedStop(pm ProcessManager, sessionID, workspaceID, cwd string) (*StopClaim, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	state, err := r.liveOwnedStateLocked(pm, sessionID, workspaceID, cwd, false)
	if err != nil {
		return nil, err
	}
	return r.claimStopLocked(sessionID, state), nil
}

func (r *Registry) liveOwnedStateLocked(pm ProcessManager, sessionID, workspaceID, cwd string, rejectStopping bool) (*Session, error) {
	state, exists := r.sessions[sessionID]
	if !exists || state.WorkspaceID != workspaceID || state.CWD != cwd {
		return nil, ErrSessionNotLive
	}
	if r.workspaceBlocksAdmissionLocked(state.WorkspaceID) {
		return nil, ErrWorkspaceClosing
	}
	if rejectStopping {
		if _, stopping := r.stops[stopKey{sessionID: sessionID, generation: state.generation}]; stopping {
			return nil, ErrSessionStopping
		}
	}
	proc, isLive := pm.Session(sessionID)
	if !isLive || proc != state.Process {
		return nil, ErrSessionNotLive
	}
	return state, nil
}
