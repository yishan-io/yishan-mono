package daemon

import (
	"context"
	"encoding/json"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) dispatchWorkspace(ctx context.Context, _ *wsConnState, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodList:
		return h.manager.List(), nil
	case MethodWorkspaceCreate:
		return h.handleWorkspaceCreate(ctx, params)
	case MethodWorkspaceRefreshPullRequest:
		return h.handleWorkspaceRefreshPullRequest(ctx, params)
	case MethodWorkspaceSyncContextLink:
		var req workspace.SyncContextLinkRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.SyncContextLink(req)
	case MethodWorkspaceSetActive:
		var req workspace.SetActiveWorkspaceRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.Terminals().SetActiveWorkspace(req)
	case MethodWorkspaceClose:
		return h.handleWorkspaceClose(ctx, params)
	case MethodWorkspaceHealth:
		return h.handleWorkspaceHealth(ctx, params)
	case MethodWorkspaceOpenProject:
		return h.handleWorkspaceOpenProject(ctx, params)
	case MethodWorkspaceCloseProject:
		return h.handleWorkspaceCloseProject(ctx, params)
	case MethodWorkspaceCreateLocalFolder:
		return h.handleWorkspaceCreateLocalFolder(ctx, params)
	case MethodWorkspaceListLocalFolders:
		return h.handleWorkspaceListLocalFolders(ctx, params)
	case MethodWorkspaceDeleteLocalFolder:
		return h.handleWorkspaceDeleteLocalFolder(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown workspace method: "+method)
	}
}

func (h *JSONRPCHandler) handleWorkspaceRefreshPullRequest(_ context.Context, params json.RawMessage) (any, error) {
	var req workspace.RefreshPullRequestRequest
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}

	workspaceID := strings.TrimSpace(req.WorkspaceID)
	workspacePath := strings.TrimSpace(req.Path)
	if workspaceID == "" && workspacePath == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "workspaceId or path is required")
	}

	ws, err := func() (workspace.Workspace, error) {
		if workspaceID != "" {
			return h.manager.GetWorkspace(workspaceID)
		}
		resolvedWorkspace, ok := h.manager.FindWorkspaceByPath(workspacePath)
		if !ok {
			return workspace.Workspace{}, workspace.NewRPCError(rpcCodeNotFound, "workspace not found")
		}
		return resolvedWorkspace, nil
	}()
	if err != nil {
		return nil, err
	}

	h.prTracker.EnsureTracked(ws.Path, false)
	h.prTracker.RefreshWorkspaceByPath(ws.Path)

	refreshedWorkspace, err := h.manager.GetWorkspace(ws.ID)
	if err != nil {
		return nil, err
	}
	return refreshedWorkspace, nil
}

func (h *JSONRPCHandler) handleWorkspaceClose(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCloseParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ProjectID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "projectId is required")
	}
	// A workspace whose worktree lives on another node is closed by relaying the
	// close request to that node; the executor tears down the worktree and marks
	// the record closed (same local-first pattern as a local close).
	nodeID := ""
	if h.localDatabase != nil {
		if record, err := localdb.NewWorkspaceStore(h.localDatabase).Get(ctx, req.WorkspaceID); err == nil {
			nodeID = record.NodeID
		}
	}
	// The origin deliberately skips the local row for remote-target creates, so a
	// missing local row is not proof of a local workspace: resolve the executor
	// node from the remote record before falling back to a local close.
	if strings.TrimSpace(nodeID) == "" {
		nodeID = h.resolveRemoteWorkspaceNode(ctx, req.OrganizationID, req.ProjectID, req.WorkspaceID)
	}
	if strings.TrimSpace(nodeID) != "" && strings.TrimSpace(nodeID) != strings.TrimSpace(h.nodeID) {
		return h.relayWorkspaceClose(req, nodeID)
	}
	return h.closeWorkspaceLocally(ctx, req)
}

func (h *JSONRPCHandler) closeWorkspaceLocally(ctx context.Context, req workspaceCloseParams) (any, error) {
	h.manager.SetWorkspaceState(req.WorkspaceID, workspace.WorkspaceStateClosing, "")

	// Mark the remote record "closing" BEFORE the (potentially slow) local
	// teardown so live workspace lists stop showing the workspace immediately.
	// Otherwise a snapshot reload during cleanup resurrects it from the still
	// active remote record. Best-effort: when the write fails the local record
	// stays authoritative and the close proceeds as before.
	h.markRemoteWorkspaceClosing(ctx, req)

	if h.tokenUsage != nil {
		h.tokenUsage.SyncNow("close")
	}
	closeReq := workspace.CloseRequest{
		WorkspaceID:   req.WorkspaceID,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	}
	ws, wsErr := h.manager.GetWorkspace(closeReq.WorkspaceID)
	if wsErr == nil && h.cleanupStore != nil {
		if err := h.cleanupStore.Add(pendingWorkspaceCleanup{
			WorkspaceID:   closeReq.WorkspaceID,
			Path:          ws.Path,
			Branch:        closeReq.Branch,
			RemoveBranch:  closeReq.RemoveBranch,
			ForceWorktree: closeReq.ForceWorktree,
			ForceBranch:   closeReq.ForceBranch,
			PostHook:      closeReq.PostHook,
		}); err != nil {
			return nil, err
		}
	}
	if wsErr == nil {
		h.watchers.Unwatch(ws.Path)
		h.prTracker.StopTracking(ws.ID)
	}
	h.summarizeUsedAgents(req.WorkspaceID, closeReq)
	if _, err := h.manager.CloseWorkspace(ctx, closeReq); err != nil {
		if h.cleanupStore != nil {
			if markErr := h.cleanupStore.MarkFailure(closeReq.WorkspaceID, err); markErr != nil {
				return nil, err
			}
		}
		// Teardown failed: revert the remote record so the workspace is not left
		// hidden behind the closing tombstone. Best-effort.
		h.revertRemoteWorkspaceClosing(ctx, req, ws, wsErr)
		return nil, err
	}
	if h.cleanupStore != nil {
		if err := h.cleanupStore.Remove(closeReq.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", closeReq.WorkspaceID).Msg("failed to remove workspace cleanup entry after close")
		}
	}
	if err := h.closePersistedWorkspace(ctx, closeReq.WorkspaceID); err != nil {
		return nil, err
	}
	h.clearAgentUsage(req.WorkspaceID)

	return map[string]any{
		"workspace":   map[string]string{"id": req.WorkspaceID, "status": "closed"},
		"workspaceId": req.WorkspaceID,
	}, nil
}

// markRemoteWorkspaceClosing writes the "closing" status to the remote record
// before the local teardown starts. Best-effort: skipped when org/project ids
// are missing (relayed closes carry them; a missing id means no remote record
// to mark) or when the write fails.
func (h *JSONRPCHandler) markRemoteWorkspaceClosing(ctx context.Context, req workspaceCloseParams) {
	if strings.TrimSpace(req.OrganizationID) == "" || strings.TrimSpace(req.ProjectID) == "" {
		return
	}
	h.closeRemoteWorkspaceRecord(ctx, req.OrganizationID, req.ProjectID, req.WorkspaceID, "closing")
}

// revertRemoteWorkspaceClosing flips a remotely-closing record back to active
// after a failed teardown, so the workspace stays visible. The worktree path is
// taken from the manager first, then the local DB row. Best-effort.
func (h *JSONRPCHandler) revertRemoteWorkspaceClosing(ctx context.Context, req workspaceCloseParams, ws workspace.Workspace, wsErr error) {
	if !remoteWorkspaceRecordsEnabled(h.runtime) {
		return
	}
	if strings.TrimSpace(req.OrganizationID) == "" || strings.TrimSpace(req.ProjectID) == "" {
		return
	}
	path := strings.TrimSpace(ws.Path)
	if path == "" && h.localDatabase != nil {
		if record, err := localdb.NewWorkspaceStore(h.localDatabase).Get(ctx, req.WorkspaceID); err == nil {
			path = strings.TrimSpace(record.LocalPath)
		}
	}
	if path == "" {
		return
	}
	h.updateRemoteWorkspaceRecord(ctx, WorkspaceCreation{
		ID:             req.WorkspaceID,
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
	}, path)
}
