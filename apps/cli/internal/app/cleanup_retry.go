package app

import (
	"context"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/workspace/application"

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
		if ctx.Err() != nil {
			return
		}
		a.retryPendingCleanup(ctx, item)
	}
}

func (a *App) retryPendingCleanup(ctx context.Context, item sqlite.PendingWorkspaceCleanup) {
	cleanupErr := a.workspaceSvc.RetryClose(ctx, application.CleanupRequest{
		WorkspaceID: item.WorkspaceID, Path: item.Path, Branch: item.Branch, RemoveBranch: item.RemoveBranch,
		ForceWorktree: item.ForceWorktree, ForceBranch: item.ForceBranch, PostHook: item.PostHook,
		AgentSummaryDone: item.AgentSummaryDone,
	})
	if cleanupErr != nil {
		a.recordRetryFailure(item, cleanupErr)
		return
	}
	log.Info().Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup completed")
}

func (a *App) recordRetryFailure(item sqlite.PendingWorkspaceCleanup, cleanupErr error) {
	if markErr := a.cleanupStore.MarkFailure(item.WorkspaceID, cleanupErr); markErr != nil {
		log.Warn().Err(markErr).Str("workspaceId", item.WorkspaceID).Msg("failed to mark workspace cleanup retry failure")
	}
	log.Warn().Err(cleanupErr).Str("workspaceId", item.WorkspaceID).Str("path", item.Path).Msg("pending workspace cleanup retry failed")
}
