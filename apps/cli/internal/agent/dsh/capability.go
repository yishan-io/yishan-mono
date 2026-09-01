package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const (
	yishanCapabilityRequestMethod = "yishan.v1.capability.request"
	maxCapabilityRequestLifetime  = 5 * time.Minute
)

// CapabilityRequest is a validated, session-authorized reverse capability request.
// Domain resolvers own operation and input validation.
type CapabilityRequest struct {
	ID             string
	CancellationID string
	SessionID      string
	WorkspaceID    string
	Operation      string
	Input          json.RawMessage
}

// CapabilityResolver runs a capability request through daemon-owned domain services.
type CapabilityResolver func(context.Context, CapabilityRequest) (any, error)

type capabilityWireRequest struct {
	ID             string          `json:"id"`
	CancellationID string          `json:"cancellationId"`
	SessionID      string          `json:"sessionId"`
	WorkspaceID    string          `json:"workspaceId"`
	Generation     uint64          `json:"generation"`
	DeadlineAtMS   int64           `json:"deadlineAtMs"`
	Operation      string          `json:"operation"`
	Input          json.RawMessage `json:"input"`
}

func (s *Supervisor) handleCapabilityRequest(process *runtimeProcess, id string, params json.RawMessage) {
	request, generation, deadline, err := parseCapabilityRequest(params, time.Now())
	if err != nil {
		s.writeRuntimeError(process, id, -32602, "invalid capability request")
		return
	}
	identity, lease, isAuthorized := s.getWorkspaceBindingLease(request.SessionID, request.WorkspaceID)
	if !isAuthorized || generation != identity.generation {
		s.writeRuntimeError(process, id, -32000, "workspace capability is not authorized for this session")
		return
	}
	ctx, cancel := context.WithDeadline(s.ctx, deadline)
	defer cancel()
	result, err := s.resolveCapability(ctx, request)
	if err != nil {
		s.writeRuntimeError(process, id, -32000, capabilityErrorMessage(ctx, err))
		return
	}
	if !s.commitWorkspaceBindingLease(lease, identity) {
		s.writeRuntimeError(process, id, -32000, "workspace capability is no longer authorized for this session")
		return
	}
	s.writeCommittedWorkspaceBindingResponse(process, id, lease, result)
}

func parseCapabilityRequest(params json.RawMessage, now time.Time) (CapabilityRequest, uint64, time.Time, error) {
	var wire capabilityWireRequest
	if err := decodeStrictJSON(params, &wire); err != nil {
		return CapabilityRequest{}, 0, time.Time{}, err
	}
	if capabilityRequestIsIncomplete(wire) {
		return CapabilityRequest{}, 0, time.Time{}, errors.New("capability request is incomplete")
	}
	deadline := time.UnixMilli(wire.DeadlineAtMS)
	if !deadline.After(now) || deadline.Sub(now) > maxCapabilityRequestLifetime {
		return CapabilityRequest{}, 0, time.Time{}, errors.New("capability request deadline is invalid")
	}
	if err := validateCapabilityInputObject(wire.Input); err != nil {
		return CapabilityRequest{}, 0, time.Time{}, err
	}
	request := CapabilityRequest{ID: wire.ID, CancellationID: wire.CancellationID, SessionID: wire.SessionID, WorkspaceID: wire.WorkspaceID, Operation: wire.Operation, Input: wire.Input}
	return request, wire.Generation, deadline, nil
}

func capabilityRequestIsIncomplete(wire capabilityWireRequest) bool {
	return wire.ID == "" || wire.CancellationID == "" || wire.SessionID == "" || wire.WorkspaceID == "" || wire.Generation == 0 || wire.DeadlineAtMS <= 0 || wire.Operation == ""
}

func validateCapabilityInputObject(raw json.RawMessage) error {
	var input map[string]json.RawMessage
	if len(raw) == 0 || raw[0] != '{' || decodeStrictJSON(raw, &input) != nil || input == nil {
		return errors.New("capability input must be an object")
	}
	return nil
}

func (s *Supervisor) resolveCapability(ctx context.Context, request CapabilityRequest) (any, error) {
	s.mu.RLock()
	resolver := s.config.CapabilityResolver
	s.mu.RUnlock()
	if resolver == nil {
		return nil, errors.New("daemon capability resolver is unavailable")
	}
	return resolver(ctx, request)
}

func capabilityErrorMessage(ctx context.Context, err error) string {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "daemon capability deadline exceeded"
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return "daemon capability cancelled"
	}
	return fmt.Sprintf("daemon capability failed: %v", err)
}

// SetCapabilityResolver wires the daemon-owned capability resolver for runtime reverse requests.
func (s *Supervisor) SetCapabilityResolver(resolver CapabilityResolver) {
	s.mu.Lock()
	s.config.CapabilityResolver = resolver
	s.mu.Unlock()
}
