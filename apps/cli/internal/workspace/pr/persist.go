package pr

import (
	"context"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

// Persistence hooks. The tracker never writes storage itself: the composition
// root wires persistPR/resolvePR to the SQLite-backed store, and these thin
// wrappers just run the hooks in background goroutines so storage latency
// never blocks the refresh loop.

// persistPullRequest writes a PR snapshot to local SQLite.
// Called in a goroutine; failures are logged and do not affect live state.
func (t *Tracker) persistPullRequest(workspaceID string, pullRequest *workspace.WorkspacePullRequest) {
	if t.persistPR == nil {
		return
	}
	if err := t.persistPR(context.Background(), workspaceID, pullRequest); err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("pr persist: failed to upsert locally")
	}
}

// resolvePullRequest clears a PR snapshot from local SQLite (called when a PR
// is no longer tracked). Runs in a goroutine; failures are logged only.
func (t *Tracker) resolvePullRequest(workspaceID string, pullRequestNumber int) {
	if t.resolvePR == nil {
		return
	}
	if err := t.resolvePR(context.Background(), workspaceID, pullRequestNumber); err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("pr persist: failed to resolve locally")
	}
}
