package agent

import (
	"context"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
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
	return s.deps.DSH.ResumeSession(ctx, dsh.SessionReadRequest{CWD: workspacePath, SessionID: sessionID})
}

func (s *Service) stopDSHWorkspaceSessions(ctx context.Context, workspaceID string) error {
	if s.deps.DSH == nil {
		return nil
	}
	workspacePath, err := s.resolveDSHWorkspacePath(workspaceID)
	if err != nil {
		return err
	}
	listed, err := s.deps.DSH.ListSessions(ctx, dsh.SessionListRequest{CWD: workspacePath})
	if errors.Is(err, dsh.ErrRuntimeUnavailable) {
		return nil
	}
	if err != nil {
		return err
	}
	var result error
	for _, session := range listed.Sessions {
		if !session.Live {
			continue
		}
		disposed, disposeErr := s.deps.DSH.DisposeSession(ctx, dsh.SessionReadRequest{CWD: workspacePath, SessionID: session.SessionID})
		if disposeErr == nil && !disposed.Disposed {
			disposeErr = fmt.Errorf("DSH session %q is live but not owned for disposal", session.SessionID)
		}
		result = errors.Join(result, disposeErr)
	}
	return result
}

func (s *Service) resolveDSHWorkspacePath(workspaceID string) (string, error) {
	workspaceInstance, err := s.deps.Workspace.GetWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return workspaceInstance.Path, nil
}

var _ DSHSessions = (*dsh.Supervisor)(nil)
