package daemon

import (
	"context"
	"time"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

const workspaceCleanupRetryInterval = 15 * time.Minute

func (h *JSONRPCHandler) startWorkspaceCleanupRetry(ctx context.Context) {
	if h.cleanupStore == nil {
		return
	}
	go func() {
		h.retryPendingWorkspaceCleanups(ctx)
		ticker := time.NewTicker(workspaceCleanupRetryInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.retryPendingWorkspaceCleanups(ctx)
			}
		}
	}()
}

func (h *JSONRPCHandler) retryPendingWorkspaceCleanups(ctx context.Context) {
	items, err := h.cleanupStore.List()
	if err != nil {
		log.Warn().Err(err).Msg("failed to list pending workspace cleanups")
		return
	}
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return
		}
		_, cleanupErr := h.manager.CloseWorkspacePath(ctx, workspace.ClosePathRequest{
			WorkspaceID:   item.WorkspaceID,
			Path:          item.Path,
			Branch:        item.Branch,
			RemoveBranch:  item.RemoveBranch,
			ForceWorktree: item.ForceWorktree,
			ForceBranch:   item.ForceBranch,
			PostHook:      item.PostHook,
		})
		if cleanupErr != nil {
			if markErr := h.cleanupStore.MarkFailure(item.WorkspaceID, cleanupErr); markErr != nil {
				log.Warn().Err(markErr).Str("workspaceId", item.WorkspaceID).Msg("failed to mark workspace cleanup retry failure")
			}
			log.Warn().Err(cleanupErr).Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup retry failed")
			continue
		}
		if err := h.cleanupStore.Remove(item.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", item.WorkspaceID).Msg("failed to remove completed pending workspace cleanup")
			continue
		}
		log.Info().Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup completed")
	}
}
