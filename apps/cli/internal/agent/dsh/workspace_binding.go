package dsh

import (
	"context"
	"errors"
)

type workspaceBindingIdentity struct {
	workspaceID string
	cwd         string
	generation  uint64
}

type workspaceBinding struct {
	identity workspaceBindingIdentity
	leases   map[uint64]workspaceBindingLeaseState
}

type workspaceBindingLeaseState uint8

const (
	workspaceBindingLeaseActive workspaceBindingLeaseState = iota
	workspaceBindingLeaseCommitted
	workspaceBindingLeaseReleaseRequested
)

type workspaceBindingLease struct {
	sessionID string
	id        uint64
}

// WorkspaceBindingRequest identifies the DSH session and workspace for daemon binding.
type WorkspaceBindingRequest struct {
	SessionID   string `json:"sessionId"`
	WorkspaceID string `json:"workspaceId"`
}

// WorkspaceBindingResult contains workspace context resolved by the daemon.
type WorkspaceBindingResult struct {
	WorkspaceID string                 `json:"workspaceId"`
	CWD         string                 `json:"cwd"`
	Generation  uint64                 `json:"generation"`
	Policy      WorkspaceBindingPolicy `json:"policy"`
}

// WorkspaceBinding admits a DSH session through the daemon workspace service.
type WorkspaceBindingResolver func(context.Context, WorkspaceBindingRequest) (WorkspaceBindingResult, error)

// SetWorkspaceBindingResolver wires the daemon-authoritative workspace resolver for runtime reverse requests.
func (s *Supervisor) SetWorkspaceBindingResolver(resolver WorkspaceBindingResolver) {
	s.mu.Lock()
	s.config.WorkspaceBindingResolver = resolver
	s.mu.Unlock()
}

func (s *Supervisor) registerWorkspaceBinding(sessionID, workspaceID, cwd string) (workspaceBindingLease, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, exists := s.workspaceBindings[sessionID]
	if exists && (binding.identity.workspaceID != workspaceID || binding.identity.cwd != cwd) {
		return workspaceBindingLease{}, errors.New("DSH session already has a different workspace binding")
	}
	if !exists {
		s.nextBindingID++
		binding = workspaceBinding{
			identity: workspaceBindingIdentity{workspaceID: workspaceID, cwd: cwd, generation: s.nextBindingID},
			leases:   make(map[uint64]workspaceBindingLeaseState),
		}
	}
	s.nextBindingID++
	lease := workspaceBindingLease{sessionID: sessionID, id: s.nextBindingID}
	binding.leases[lease.id] = workspaceBindingLeaseActive
	s.workspaceBindings[sessionID] = binding
	return lease, nil
}

func (s *Supervisor) getWorkspaceBindingLease(sessionID, workspaceID string) (workspaceBindingIdentity, workspaceBindingLease, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	binding, exists := s.workspaceBindings[sessionID]
	if !exists || binding.identity.workspaceID != workspaceID {
		return workspaceBindingIdentity{}, workspaceBindingLease{}, false
	}
	for leaseID, state := range binding.leases {
		if state == workspaceBindingLeaseActive {
			return binding.identity, workspaceBindingLease{sessionID: sessionID, id: leaseID}, true
		}
	}
	return workspaceBindingIdentity{}, workspaceBindingLease{}, false
}

// commitWorkspaceBindingLease changes one active lease into an in-flight response.
// A caller release is recorded but cannot revoke this committed authorization until the
// positive response has been written or its write has failed.
func (s *Supervisor) commitWorkspaceBindingLease(lease workspaceBindingLease, identity workspaceBindingIdentity) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, exists := s.workspaceBindings[lease.sessionID]
	if !exists || binding.identity != identity || binding.leases[lease.id] != workspaceBindingLeaseActive {
		return false
	}
	binding.leases[lease.id] = workspaceBindingLeaseCommitted
	s.workspaceBindings[lease.sessionID] = binding
	return true
}

// finishWorkspaceBindingResponse resolves the committed state after the response write.
func (s *Supervisor) finishWorkspaceBindingResponse(lease workspaceBindingLease, wroteResponse bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, exists := s.workspaceBindings[lease.sessionID]
	if !exists {
		return
	}
	state, exists := binding.leases[lease.id]
	if !exists || (state != workspaceBindingLeaseCommitted && state != workspaceBindingLeaseReleaseRequested) {
		return
	}
	if !wroteResponse || state == workspaceBindingLeaseReleaseRequested {
		delete(binding.leases, lease.id)
	} else {
		binding.leases[lease.id] = workspaceBindingLeaseActive
	}
	if len(binding.leases) == 0 {
		delete(s.workspaceBindings, lease.sessionID)
		return
	}
	s.workspaceBindings[lease.sessionID] = binding
}

func (s *Supervisor) releaseWorkspaceBinding(lease workspaceBindingLease) {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, exists := s.workspaceBindings[lease.sessionID]
	if !exists {
		return
	}
	if binding.leases[lease.id] == workspaceBindingLeaseCommitted {
		binding.leases[lease.id] = workspaceBindingLeaseReleaseRequested
		s.workspaceBindings[lease.sessionID] = binding
		return
	}
	delete(binding.leases, lease.id)
	if len(binding.leases) == 0 {
		delete(s.workspaceBindings, lease.sessionID)
		return
	}
	s.workspaceBindings[lease.sessionID] = binding
}

func (s *Supervisor) removeWorkspaceBindings(sessionID string) {
	s.mu.Lock()
	delete(s.workspaceBindings, sessionID)
	s.mu.Unlock()
}
