package application

import (
	"context"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// RetryClose completes a persisted close retry through the same agent cleanup,
// summarization, usage cleanup, and persistence finalization as CloseLocal.
func (s *Service) RetryClose(ctx context.Context, cleanup CleanupRequest) error {
	ws, isRuntimeOpen := s.prepareRetryRuntime(cleanup)
	terminalErrors := s.deps.Instances.StopWorkspaceTerminals(cleanup.WorkspaceID)
	handle, err := s.beginAgentCleanup(ctx, cleanup.WorkspaceID)
	if err != nil {
		return s.abortRetry(cleanup, ws, isRuntimeOpen, handle, err)
	}
	closeReq := retryCloseRequest(cleanup)
	if err := s.summarizeCloseAgents(closeReq, cleanup.AgentSummaryDone); err != nil {
		return s.abortRetry(cleanup, ws, isRuntimeOpen, handle, err)
	}
	result, err := s.deps.Instances.CloseWorkspacePath(ctx, retryClosePathRequest(cleanup))
	if err != nil && !result.WorktreeRemoved {
		return s.abortRetry(cleanup, ws, isRuntimeOpen, handle, errors.Join(err, terminalErrorsError(terminalErrors)))
	}
	s.deps.Instances.RemoveFromMemory(cleanup.WorkspaceID)
	s.commitAgentCleanup(handle)
	return s.finishRetry(ctx, cleanup, err)
}

func (s *Service) prepareRetryRuntime(cleanup CleanupRequest) (workspace.Workspace, bool) {
	ws, err := s.deps.Instances.Get(cleanup.WorkspaceID)
	if err != nil {
		return workspace.Workspace{}, false
	}
	_ = s.deps.Instances.SetState(ws.ID, instance.StateClosing, instance.HealthOK)
	s.deps.Instances.Unwatch(ws.Path)
	s.deps.Instances.StopTracking(ws.ID)
	return ws, true
}

func (s *Service) abortRetry(cleanup CleanupRequest, ws workspace.Workspace, isRuntimeOpen bool, handle any, closeErr error) error {
	restoreErr := s.restoreRetryRuntime(ws, isRuntimeOpen)
	if restoreErr != nil {
		// Keep the cleanup marker and its admission block: a partially restored
		// runtime cannot safely accept a new agent process.
		return errors.Join(closeErr, restoreErr, s.markCleanupFailure(cleanup.WorkspaceID, closeErr))
	}
	s.abortAgentCleanup(handle)
	return errors.Join(closeErr, s.markCleanupFailure(cleanup.WorkspaceID, closeErr))
}

func (s *Service) restoreRetryRuntime(ws workspace.Workspace, isRuntimeOpen bool) error {
	if !isRuntimeOpen {
		return nil
	}
	if err := s.deps.Instances.SetState(ws.ID, instance.StateActive, instance.HealthOK); err != nil {
		return fmt.Errorf("restore retry workspace state: %w", err)
	}
	if err := s.deps.Instances.WatchAndTrack(ws); err != nil {
		if stateErr := s.deps.Instances.SetState(ws.ID, instance.StateClosing, instance.HealthOK); stateErr != nil {
			return errors.Join(fmt.Errorf("restore retry workspace watchers: %w", err), fmt.Errorf("return retry workspace to closing: %w", stateErr))
		}
		return fmt.Errorf("restore retry workspace watchers: %w", err)
	}
	return nil
}

func (s *Service) finishRetry(ctx context.Context, cleanup CleanupRequest, closeErr error) error {
	persistErr := s.deps.Records.ClosePersisted(ctx, cleanup.WorkspaceID)
	if s.deps.ClearAgentUsage != nil {
		s.deps.ClearAgentUsage(cleanup.WorkspaceID)
	}
	if s.deps.RemoveCleanup != nil {
		if err := s.deps.RemoveCleanup(cleanup.WorkspaceID); err != nil {
			return errors.Join(closeErr, persistErr, err)
		}
	}
	return errors.Join(closeErr, persistErr)
}

func retryCloseRequest(cleanup CleanupRequest) workspace.CloseRequest {
	return workspace.CloseRequest{WorkspaceID: cleanup.WorkspaceID, Branch: cleanup.Branch, RemoveBranch: cleanup.RemoveBranch, ForceWorktree: cleanup.ForceWorktree, ForceBranch: cleanup.ForceBranch, PostHook: cleanup.PostHook}
}

func retryClosePathRequest(cleanup CleanupRequest) workspace.ClosePathRequest {
	return workspace.ClosePathRequest{WorkspaceID: cleanup.WorkspaceID, Path: cleanup.Path, Branch: cleanup.Branch, RemoveBranch: cleanup.RemoveBranch, ForceWorktree: cleanup.ForceWorktree, ForceBranch: cleanup.ForceBranch, PostHook: cleanup.PostHook}
}

func terminalErrorsError(terminalErrors []string) error {
	if len(terminalErrors) == 0 {
		return nil
	}
	return errors.New("terminal cleanup failed")
}
