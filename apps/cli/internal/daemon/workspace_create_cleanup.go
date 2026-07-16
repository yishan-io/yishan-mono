package daemon

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) cleanupLocalWorkspaceCreateFailure(ctx context.Context, closeReq workspace.ClosePathRequest) {
	createflow.CleanupLocalWorkspaceCreateFailure(ctx, createflow.CleanupDependencies{
		Unwatch:      h.watchers.Unwatch,
		StopTracking: h.prTracker.StopTracking,
		RegisterCleanup: func(req workspace.ClosePathRequest) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Add(pendingWorkspaceCleanup{
				WorkspaceID:   req.WorkspaceID,
				Path:          req.Path,
				Branch:        req.Branch,
				RemoveBranch:  req.RemoveBranch,
				ForceWorktree: req.ForceWorktree,
				ForceBranch:   req.ForceBranch,
				PostHook:      req.PostHook,
			})
		},
		CloseWorkspacePath: func(ctx context.Context, req workspace.ClosePathRequest) error {
			_, err := h.manager.CloseWorkspacePath(ctx, req)
			return err
		},
		MarkCleanupFailure: func(workspaceID string, cleanupErr error) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.MarkFailure(workspaceID, cleanupErr)
		},
		RemoveRegisteredCleanup: func(workspaceID string) error {
			if h.cleanupStore == nil {
				return nil
			}
			return h.cleanupStore.Remove(workspaceID)
		},
		RemoveWorkspaceFromMemory: h.manager.RemoveWorkspaceFromMemory,
		RemoveWorkspaceIndex: func(workspaceID string) error {
			if h.wsIndexStore == nil {
				return nil
			}
			return h.wsIndexStore.Remove(workspaceID)
		},
		ClearAgentUsage: h.clearAgentUsage,
		Warn: func(workspaceID string, path string, message string, err error) {
			entry := log.Warn().Err(err).Str("workspaceId", workspaceID)
			if strings.TrimSpace(path) != "" {
				entry = entry.Str("path", path)
			}
			entry.Msg(message)
		},
	}, closeReq)
}
