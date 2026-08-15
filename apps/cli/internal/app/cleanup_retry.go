package app

import (
	"context"
	"time"

	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

const cleanupRetryInterval = 15 * time.Minute

// StartCleanupRetry retries pending workspace cleanups once on startup and
// then on a periodic tick until the app closes.
func (a *App) StartCleanupRetry() {
	if a.cleanupStore == nil {
		return
	}
	go func() {
		a.retryPendingCleanups(a.cleanupCtx)
		ticker := time.NewTicker(cleanupRetryInterval)
		defer ticker.Stop()
		for {
			select {
			case <-a.cleanupCtx.Done():
				return
			case <-ticker.C:
				a.retryPendingCleanups(a.cleanupCtx)
			}
		}
	}()
}

func (a *App) retryPendingCleanups(ctx context.Context) {
	items, err := a.cleanupStore.List()
	if err != nil {
		log.Warn().Err(err).Msg("failed to list pending workspace cleanups")
		return
	}
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return
		}
		_, cleanupErr := a.service.CloseWorkspacePath(ctx, workspace.ClosePathRequest{
			WorkspaceID:   item.WorkspaceID,
			Path:          item.Path,
			Branch:        item.Branch,
			RemoveBranch:  item.RemoveBranch,
			ForceWorktree: item.ForceWorktree,
			ForceBranch:   item.ForceBranch,
			PostHook:      item.PostHook,
		})
		if cleanupErr != nil {
			if markErr := a.cleanupStore.MarkFailure(item.WorkspaceID, cleanupErr); markErr != nil {
				log.Warn().Err(markErr).Str("workspaceId", item.WorkspaceID).Msg("failed to mark workspace cleanup retry failure")
			}
			log.Warn().Err(cleanupErr).Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup retry failed")
			continue
		}
		// Mark the workspace record closed before dropping the retry entry so
		// hydration on the next daemon start does not resurrect it as active.
		if closeErr := a.service.ClosePersisted(ctx, item.WorkspaceID); closeErr != nil {
			log.Warn().Err(closeErr).Str("workspaceId", item.WorkspaceID).Msg("failed to mark persisted workspace closed after cleanup")
		}
		if err := a.cleanupStore.Remove(item.WorkspaceID); err != nil {
			log.Warn().Err(err).Str("workspaceId", item.WorkspaceID).Msg("failed to remove completed pending workspace cleanup")
			continue
		}
		log.Info().Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup completed")
	}
}
