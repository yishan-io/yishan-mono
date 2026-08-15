package application

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpcerror"
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
	Relayed bool
}

// Close handles a workspace.close request: validates the input, resolves the
// node that owns the workspace's worktree, and either relays the close to that
// node or closes locally. Routing and revert-on-failure policy live here.
func (s *Service) Close(ctx context.Context, command CloseCommand) (CloseResult, error) {
	if strings.TrimSpace(command.ProjectID) == "" {
		return CloseResult{}, rpcerror.NewRPCError(rpcerror.CodeInvalidParams, "projectId is required")
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

// CloseLocal runs the local close pipeline: mark closing (local + remote) →
// teardown → mark closed. Used for local closes and by the relay executor.
func (s *Service) CloseLocal(ctx context.Context, command CloseCommand) (CloseResult, error) {
	s.deps.Instances.SetState(command.WorkspaceID, instance.StateClosing, instance.HealthOK)

	// Mark the remote record "closing" BEFORE the (potentially slow) local
	// teardown so live workspace lists stop showing the workspace immediately.
	// Otherwise a snapshot reload during cleanup resurrects it from the still
	// active remote record. Best-effort: when the write fails the local record
	// stays authoritative and the close proceeds as before.
	s.deps.Records.CloseRemoteRecord(ctx, command.OrganizationID, command.ProjectID, command.WorkspaceID, workspace.StatusClosing)

	if s.deps.SyncUsage != nil {
		s.deps.SyncUsage("close")
	}
	closeReq := workspace.CloseRequest{
		WorkspaceID: command.WorkspaceID, Branch: command.Branch, RemoveBranch: command.RemoveBranch,
		ForceWorktree: command.ForceWorktree, ForceBranch: command.ForceBranch, PostHook: command.PostHook,
	}
	ws, wsErr := s.deps.Instances.Get(closeReq.WorkspaceID)
	if wsErr == nil {
		if err := s.registerCloseCleanup(closeReq, ws); err != nil {
			return CloseResult{}, err
		}
	}
	if wsErr == nil {
		s.deps.Instances.Unwatch(ws.Path)
		s.deps.Instances.StopTracking(ws.ID)
	}
	if s.deps.SummarizeAgents != nil {
		s.deps.SummarizeAgents(command.WorkspaceID, closeReq)
	}
	if _, err := s.deps.Instances.CloseWorkspace(ctx, closeReq); err != nil {
		if s.deps.MarkCleanupFailure != nil {
			if markErr := s.deps.MarkCleanupFailure(closeReq.WorkspaceID, err); markErr != nil {
				return CloseResult{}, err
			}
		}
		// Teardown failed: revert the remote record so the workspace is not
		// left hidden behind the closing tombstone. Best-effort.
		s.revertRemoteClosing(ctx, command, ws, wsErr)
		return CloseResult{}, err
	}
	if s.deps.RemoveCleanup != nil {
		if err := s.deps.RemoveCleanup(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace cleanup entry after close")
		}
	}
	if err := s.deps.Records.ClosePersisted(ctx, closeReq.WorkspaceID); err != nil {
		return CloseResult{}, err
	}
	if s.deps.ClearAgentUsage != nil {
		s.deps.ClearAgentUsage(command.WorkspaceID)
	}

	return CloseResult{WorkspaceID: command.WorkspaceID, Status: string(workspace.StatusClosed)}, nil
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
