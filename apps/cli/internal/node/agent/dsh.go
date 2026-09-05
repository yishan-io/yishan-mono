package agent

import (
	"context"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// ListDSHSessions lists durable DSH sessions for an open workspace.
func (s *Service) ListDSHSessions(ctx context.Context, workspaceID string) (dsh.SessionListResult, error) {
	workspacePath, err := s.resolveDSHWorkspacePath(workspaceID)
	if err != nil {
		return dsh.SessionListResult{}, err
	}
	if s.deps.DSH == nil {
		return dsh.SessionListResult{}, dsh.ErrRuntimeUnavailable
	}
	return s.deps.DSH.ListSessions(ctx, dsh.SessionListRequest{CWD: workspacePath})
}

func (s *Service) listDSHSessionLineage(ctx context.Context, cwd, rootSessionID string, mode rpc.AgentSessionLineageMode) (dsh.SessionLineageResult, error) {
	lineage, ok := s.deps.DSH.(DSHSessionLineage)
	if !ok {
		return dsh.SessionLineageResult{}, dsh.ErrRuntimeUnavailable
	}
	return lineage.ListSessionLineage(ctx, dsh.SessionLineageRequest{
		CWD: cwd, RootSessionID: rootSessionID, Mode: dsh.SessionLineageMode(mode),
	})
}

func mapDSHSessionLineage(lineage dsh.SessionLineageResult) rpc.AgentSessionLineageResult {
	children := make([]rpc.AgentSessionLineageEntry, 0, len(lineage.Children))
	for _, child := range lineage.Children {
		children = append(children, rpc.AgentSessionLineageEntry{
			SessionID: child.SessionID, ParentSessionID: child.ParentSessionID, Origin: rpc.AgentSessionLineageOrigin(child.Origin),
			DelegationDepth: child.DelegationDepth, RelativeDepth: child.RelativeDepth, Live: child.Live,
			Persisted: child.Persisted, Activity: rpc.AgentSessionLineageActivity(child.Activity), Mode: rpc.AgentSessionLineageChildMode(child.Mode), Label: child.Label,
		})
	}
	return rpc.AgentSessionLineageResult{Runtime: rpc.AgentRuntimeDSH, RootSessionID: lineage.RootSessionID,
		Mode: rpc.AgentSessionLineageMode(lineage.Mode), Children: children}
}

// ReadDSHSession reads a durable DSH session for an open workspace.
func (s *Service) ReadDSHSession(ctx context.Context, workspaceID string, sessionID string) (dsh.SessionReadResult, error) {
	workspacePath, err := s.resolveDSHWorkspacePath(workspaceID)
	if err != nil {
		return dsh.SessionReadResult{}, err
	}
	if s.deps.DSH == nil {
		return dsh.SessionReadResult{}, dsh.ErrRuntimeUnavailable
	}
	return s.deps.DSH.ReadSession(ctx, dsh.SessionReadRequest{CWD: workspacePath, SessionID: sessionID})
}

// ResumeDSHSession resumes a durable DSH session for an open workspace.
func (s *Service) ResumeDSHSession(ctx context.Context, workspaceID string, sessionID string) (dsh.SessionResumeResult, error) {
	admission, err := s.piSessions.Admit(workspaceID)
	if err != nil {
		return dsh.SessionResumeResult{}, err
	}
	defer s.piSessions.ReleaseAdmission(admission)
	workspacePath, err := s.resolveDSHWorkspacePath(workspaceID)
	if err != nil {
		return dsh.SessionResumeResult{}, err
	}
	if s.deps.DSH == nil {
		return dsh.SessionResumeResult{}, dsh.ErrRuntimeUnavailable
	}
	return s.deps.DSH.ResumeSession(ctx, dsh.SessionResumeRequest{CWD: workspacePath, SessionID: sessionID, WorkspaceID: workspaceID})
}

func (s *Service) stopDSHWorkspaceSessions(ctx context.Context, workspaceID string) error {
	if s.deps.DSH == nil {
		return nil
	}
	workspacePath, err := s.resolveDSHTeardownWorkspacePath(workspaceID)
	if err != nil {
		return err
	}
	disposed := s.disposeRegisteredDSHSessions(ctx, workspaceID)
	listed, err := s.deps.DSH.ListSessions(ctx, dsh.SessionListRequest{CWD: workspacePath})
	if errors.Is(err, dsh.ErrRuntimeUnavailable) {
		return disposed
	}
	if err != nil {
		return errors.Join(disposed, err)
	}
	return errors.Join(disposed, s.disposeListedDSHSessions(ctx, workspacePath, listed.Sessions))
}

func (s *Service) disposeRegisteredDSHSessions(ctx context.Context, workspaceID string) error {
	var result error
	for _, entry := range s.dshSessions.workspaceEntries(workspaceID) {
		disposed, err := s.deps.DSH.DisposeSession(ctx, dsh.SessionReadRequest{CWD: entry.cwd, SessionID: entry.sessionID})
		if err == nil && !disposed.Disposed {
			err = fmt.Errorf("DSH registered session %q was not disposed", entry.sessionID)
		}
		if err == nil && s.removeDSHNotificationSession(entry) {
			s.runtimeIdentities.release(entry.sessionID, rpc.AgentRuntimeDSH)
		}
		result = errors.Join(result, err)
	}
	return result
}

func (s *Service) disposeListedDSHSessions(ctx context.Context, cwd string, sessions []dsh.SessionListEntry) error {
	var result error
	for _, listed := range sessions {
		if !listed.Live {
			continue
		}
		disposed, err := s.deps.DSH.DisposeSession(ctx, dsh.SessionReadRequest{CWD: cwd, SessionID: listed.SessionID})
		if err == nil && !disposed.Disposed {
			err = fmt.Errorf("DSH session %q is live but not owned for disposal", listed.SessionID)
		}
		if err == nil {
			s.runtimeIdentities.release(listed.SessionID, rpc.AgentRuntimeDSH)
		}
		result = errors.Join(result, err)
	}
	return result
}
func (s *Service) resolveDSHWorkspacePath(workspaceID string) (string, error) {
	workspaceInstance, err := s.resolveAuthorizedDSHWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return workspaceInstance.Path, nil
}

var _ DSHSessions = (*dsh.Supervisor)(nil)
var _ DSHSessionFilePath = (*dsh.Supervisor)(nil)
var _ DSHSessionLineage = (*dsh.Supervisor)(nil)

// resolveDSHTeardownWorkspacePath admits a closing workspace only while its
// DSH sessions are being drained. It must not be used by live agent operations.
func (s *Service) resolveDSHTeardownWorkspacePath(workspaceID string) (string, error) {
	if s.deps.Workspace == nil {
		return "", rpc.NewRPCError(rpc.CodeServerError, "workspace resolver is unavailable")
	}
	workspaceInstance, err := s.deps.Workspace.GetWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	if workspaceInstance.Path == "" || workspaceInstance.Health != workspace.HealthOK ||
		(workspaceInstance.State != workspace.StateActive && workspaceInstance.State != workspace.StateClosing) {
		return "", rpc.NewRPCError(rpc.CodeNotFound, "workspace is unavailable for teardown")
	}
	return workspaceInstance.Path, nil
}
