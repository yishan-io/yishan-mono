package application

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

// CloseResult is the outcome of a workspace close, encoded by the JSON-RPC handler
// into the workspace.close result payload.
type CloseResult struct {
	WorkspaceID string
	Status      string
	// Relayed reports that the close was forwarded to the owning node; the
	// Relayed marks that the handler must emit the relay result shape.
	Relayed               bool
	PostHookResult        *workspace.HookResult
	TerminalCleanupErrors []string
}

// Close handles a workspace.close request: validates the input, resolves the
// node that owns the workspace's worktree, and either relays the close to that
// node or closes locally. Routing and revert-on-failure policy live here.
func (s *Service) Close(ctx context.Context, command CloseCommand) (CloseResult, error) {
	if strings.TrimSpace(command.ProjectID) == "" {
		return CloseResult{}, workspace.NewError(workspace.ErrCodeInvalidParams, "projectId is required")
	}
	nodeID := s.ownerNodeForClose(ctx, command)
	if strings.TrimSpace(nodeID) != "" && strings.TrimSpace(nodeID) != strings.TrimSpace(s.deps.NodeID) {
		if err := s.relayClose(ctx, command, nodeID); err != nil {
			return CloseResult{}, err
		}
		return CloseResult{WorkspaceID: command.WorkspaceID, Status: "closing", Relayed: true}, nil
	}
	return s.CloseLocal(ctx, command)
}

// ownerNodeForClose resolves the node that owns the workspace's worktree: the
// local SQLite row first, then the cloud record (a relayed create leaves no
// local row on the origin). Empty when unresolvable.
func (s *Service) ownerNodeForClose(ctx context.Context, command CloseCommand) string {
	if row, ok := s.deps.Records.LocalRow(ctx, command.WorkspaceID); ok {
		if nodeID := strings.TrimSpace(row.NodeID); nodeID != "" {
			return nodeID
		}
	}
	if !s.deps.Environment.APIConfigured() {
		return ""
	}
	records, err := s.deps.Environment.ListWorkspaces(ctx, command.OrganizationID, command.ProjectID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", command.WorkspaceID).Str("orgId", command.OrganizationID).Str("projectId", command.ProjectID).Msg("resolve workspace owner node: list workspaces failed")
		return ""
	}
	for _, record := range records {
		if string(record.ID) == command.WorkspaceID {
			return record.NodeID
		}
	}
	return ""
}

// relayClose forwards a close request to the node that owns the workspace's
// worktree. The executor runs the same local-first close path and marks the
// remote record closed. When the target node is offline the relay rejects the
// dispatch and the close is NOT allowed (no fake "closing").
func (s *Service) relayClose(ctx context.Context, command CloseCommand, targetNodeID string) error {
	return s.deps.Relay.DispatchClose(ctx, command, targetNodeID)
}

// CloseLocal runs the local close pipeline. Until CloseWorkspace reports a
// removed worktree every failure restores runtime before reopening admission.
func (s *Service) CloseLocal(ctx context.Context, command CloseCommand) (CloseResult, error) {
	closeReq := closeRequest(command)
	ws, wsErr, err := s.prepareClose(ctx, command, closeReq)
	if err != nil {
		return CloseResult{}, err
	}
	terminalErrors := s.deps.Instances.StopWorkspaceTerminals(command.WorkspaceID)
	handle, err := s.beginAgentCleanup(ctx, command.WorkspaceID)
	if err != nil {
		return s.abortAfterRestore(ctx, command, ws, wsErr, handle, terminalErrors, err)
	}
	if err := s.summarizeCloseAgents(closeReq, false); err != nil {
		return s.abortAfterRestore(ctx, command, ws, wsErr, handle, terminalErrors, err)
	}
	teardown, teardownErr := s.deps.Instances.CloseWorkspace(ctx, closeReq)
	teardown.TerminalCleanupErrors = terminalErrors
	if !teardown.WorktreeRemoved && teardownErr != nil {
		return s.abortAfterRestore(ctx, command, ws, wsErr, handle, terminalErrors, teardownErr)
	}
	return s.finishClose(ctx, command, closeReq, handle, teardown, teardownErr)
}

func (s *Service) abortAfterRestore(ctx context.Context, command CloseCommand, ws workspace.Workspace, wsErr error, handle any, terminalErrors []string, closeErr error) (CloseResult, error) {
	if restoreErr := s.restoreCloseFailure(ctx, command, ws, wsErr); restoreErr != nil {
		// Keep the closing marker: runtime restoration is incomplete, so reopening
		// Pi admission could let a process use an unsafe worktree.
		return CloseResult{TerminalCleanupErrors: terminalErrors}, errors.Join(closeErr, restoreErr)
	}
	markErr := s.markCleanupFailure(command.WorkspaceID, closeErr)
	s.abortAgentCleanup(handle)
	return CloseResult{TerminalCleanupErrors: terminalErrors}, errors.Join(closeErr, markErr)
}

func closeRequest(command CloseCommand) workspace.CloseRequest {
	return workspace.CloseRequest{
		WorkspaceID: command.WorkspaceID, Branch: command.Branch, RemoveBranch: command.RemoveBranch,
		ForceWorktree: command.ForceWorktree, ForceBranch: command.ForceBranch, PostHook: command.PostHook,
	}
}

func (s *Service) prepareClose(ctx context.Context, command CloseCommand, closeReq workspace.CloseRequest) (workspace.Workspace, error, error) {
	s.deps.Instances.SetState(command.WorkspaceID, instance.StateClosing, instance.HealthOK)
	s.deps.Records.CloseRemoteRecord(ctx, command.OrganizationID, command.ProjectID, command.WorkspaceID, workspace.StatusClosing)
	if s.deps.SyncUsage != nil {
		s.deps.SyncUsage("close")
	}
	ws, wsErr := s.deps.Instances.Get(closeReq.WorkspaceID)
	if wsErr != nil {
		return ws, wsErr, nil
	}
	if err := s.registerCloseCleanup(closeReq, ws); err != nil {
		restoreErr := s.restoreCloseFailure(ctx, command, ws, wsErr)
		return ws, wsErr, errors.Join(err, restoreErr)
	}
	s.deps.Instances.Unwatch(ws.Path)
	s.deps.Instances.StopTracking(ws.ID)
	return ws, nil, nil
}

func (s *Service) finishClose(ctx context.Context, command CloseCommand, closeReq workspace.CloseRequest, handle any, teardown workspace.CloseResult, teardownErr error) (CloseResult, error) {
	// The worktree/runtime are gone. Commit before persistence or remote work:
	// no post-removal error can reopen agent admission.
	s.commitAgentCleanup(handle)
	if s.deps.RemoveCleanup != nil {
		if err := s.deps.RemoveCleanup(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace cleanup entry after close")
		}
	}
	persistErr := s.deps.Records.ClosePersisted(ctx, closeReq.WorkspaceID)
	if s.deps.ClearAgentUsage != nil {
		s.deps.ClearAgentUsage(command.WorkspaceID)
	}
	result := CloseResult{WorkspaceID: command.WorkspaceID, Status: string(workspace.StatusClosed), PostHookResult: teardown.PostHookResult, TerminalCleanupErrors: teardown.TerminalCleanupErrors}
	return result, errors.Join(teardownErr, persistErr)
}

func (s *Service) beginAgentCleanup(ctx context.Context, workspaceID string) (any, error) {
	if s.deps.BeginAgentCleanup == nil {
		return nil, nil
	}
	return s.deps.BeginAgentCleanup(ctx, workspaceID)
}

func (s *Service) summarizeCloseAgents(closeReq workspace.CloseRequest, agentSummaryDone bool) error {
	if agentSummaryDone || s.deps.SummarizeAgents == nil {
		return nil
	}
	if s.deps.ClaimAgentSummary != nil {
		claimed, err := s.deps.ClaimAgentSummary(closeReq.WorkspaceID)
		if err != nil {
			return err
		}
		if !claimed {
			return nil
		}
	}
	s.deps.SummarizeAgents(closeReq.WorkspaceID, closeReq)
	return nil
}

func (s *Service) markCleanupFailure(workspaceID string, cleanupErr error) error {
	if s.deps.MarkCleanupFailure == nil {
		return nil
	}
	return s.deps.MarkCleanupFailure(workspaceID, cleanupErr)
}

func (s *Service) abortAgentCleanup(handle any) {
	if s.deps.AbortAgentCleanup != nil {
		s.deps.AbortAgentCleanup(handle)
	}
}

func (s *Service) commitAgentCleanup(handle any) {
	if s.deps.CommitAgentCleanup != nil {
		s.deps.CommitAgentCleanup(handle)
	}
}

func (s *Service) restoreCloseFailure(ctx context.Context, command CloseCommand, ws workspace.Workspace, wsErr error) error {
	if wsErr != nil {
		s.revertRemoteClosing(ctx, command, ws, wsErr)
		return nil
	}
	if err := s.deps.Instances.SetState(ws.ID, instance.StateActive, instance.HealthOK); err != nil {
		return fmt.Errorf("restore workspace state: %w", err)
	}
	if err := s.deps.Instances.WatchAndTrack(ws); err != nil {
		// State active without watchers is not a valid restored runtime. Return it
		// to closing and keep the agent cleanup marker installed.
		if stateErr := s.deps.Instances.SetState(ws.ID, instance.StateClosing, instance.HealthOK); stateErr != nil {
			return errors.Join(fmt.Errorf("restore workspace watchers: %w", err), fmt.Errorf("return workspace to closing: %w", stateErr))
		}
		return fmt.Errorf("restore workspace watchers: %w", err)
	}
	s.revertRemoteClosing(ctx, command, ws, wsErr)
	return nil
}

func (s *Service) registerCloseCleanup(closeReq workspace.CloseRequest, ws workspace.Workspace) error {
	if s.deps.RegisterCleanup == nil {
		return nil
	}
	return s.deps.RegisterCleanup(CleanupRequest{
		WorkspaceID: closeReq.WorkspaceID, Path: ws.Path, Branch: closeReq.Branch,
		RemoveBranch: closeReq.RemoveBranch, ForceWorktree: closeReq.ForceWorktree,
		ForceBranch: closeReq.ForceBranch, PostHook: closeReq.PostHook,
	})
}

// revertRemoteClosing flips a remotely-closing record back to active after a
// failed teardown so the workspace stays visible. The worktree path is taken
// from the manager first, then the local DB row. Best-effort.
func (s *Service) revertRemoteClosing(ctx context.Context, command CloseCommand, ws workspace.Workspace, wsErr error) {
	if !s.deps.Environment.APIConfigured() {
		return
	}
	if strings.TrimSpace(command.OrganizationID) == "" || strings.TrimSpace(command.ProjectID) == "" {
		return
	}
	path := strings.TrimSpace(ws.Path)
	if path == "" && wsErr != nil {
		if row, ok := s.deps.Records.LocalRow(ctx, command.WorkspaceID); ok {
			path = strings.TrimSpace(row.LocalPath)
		}
	}
	if path == "" {
		return
	}
	s.deps.Records.UpdateRemoteRecord(ctx, Registration{
		ID: command.WorkspaceID, OrganizationID: command.OrganizationID, ProjectID: command.ProjectID,
	}, path)
}
