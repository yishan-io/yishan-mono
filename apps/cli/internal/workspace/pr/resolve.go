package pr

import (
	"context"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

// Git query flow. The tracker talks to git only through the resolver hooks
// wired in New (branchResolver / inspectResolver / detailResolver), so tests
// and alternate providers can substitute their own queries. No storage and no
// event publication happens here beyond the instance/PR state transition in
// setRefreshedWorkspacePullRequest.

// refreshWorkspace resolves the current branch and pull request for one
// workspace and applies the result to the instance registry. Tracking is
// disabled (active entry removed) when the workspace cannot be on a branch or
// its provider has no PR support; a missing PR only clears the bound record
// and keeps the workspace active for future detection.
func (t *Tracker) refreshWorkspace(ws workspace.Workspace) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	branch, err := t.branchResolver(ctx, ws.Path)
	if err != nil {
		if shouldDisableTrackingForBranchError(err) {
			t.setRefreshedWorkspacePullRequest(ws, nil, false)
			log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh disabled tracking because branch could not be resolved")
			return nil
		}
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh failed to resolve branch")
		return err
	}
	branch = strings.TrimSpace(branch)
	log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh resolved branch")
	if branch == "" || branch == "HEAD" {
		t.setRefreshedWorkspacePullRequest(ws, nil, true)
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh cleared PR because branch is empty or detached")
		return nil
	}

	pr, err := t.detailResolver(ctx, ws.Path, branch)
	if err != nil {
		if shouldErrDisableTracking(err) {
			t.setRefreshedWorkspacePullRequest(ws, nil, false)
			log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh disabled tracking for repository without PR support")
			return nil
		}
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh failed to resolve pull request")
		return err
	}
	if !pr.Found {
		t.setRefreshedWorkspacePullRequest(ws, nil, true)
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh found no pull request")
		return nil
	}

	status := normalizeWorkspacePullRequestStatus(pr)
	bound := &workspace.WorkspacePullRequest{
		Number:         pr.Number,
		Title:          pr.Title,
		URL:            pr.URL,
		Branch:         pr.HeadRefName,
		BaseBranch:     pr.BaseRefName,
		GitHubState:    pr.State,
		Status:         status,
		ReviewDecision: pr.ReviewDecision,
		IsDraft:        pr.IsDraft,
		Complete:       status == "merged",
		UpdatedAt:      nowRFC3339Nano(),
		Checks:         pr.Checks,
		Deployments:    pr.Deployments,
	}
	complete := status == "merged"
	t.setRefreshedWorkspacePullRequest(ws, bound, !complete)
	log.Debug().
		Str("workspaceId", ws.ID).
		Str("path", ws.Path).
		Str("branch", branch).
		Int("pullRequestNumber", pr.Number).
		Str("pullRequestStatus", status).
		Bool("complete", complete).
		Msg("workspace PR refresh synced pull request")
	return nil
}

// setRefreshedWorkspacePullRequest applies a resolved PR state to the instance
// registry, publishes the typed update on meaningful change, maintains the
// active-tracking set, and hands persistence to the background hooks.
func (t *Tracker) setRefreshedWorkspacePullRequest(ws workspace.Workspace, pr *workspace.WorkspacePullRequest, keepActive bool) {
	previousPullRequest, didApply := t.applyRefreshedPullRequest(ws, pr, keepActive)
	if !didApply {
		return
	}

	if prMeaningfullyChanged(previousPullRequest, pr) && t.onPullRequestUpdated != nil {
		t.onPullRequestUpdated(PullRequestUpdatedEvent{
			WorkspaceID:           ws.ID,
			WorkspaceWorktreePath: ws.Path,
			PullRequest:           pr,
		})
	}

	// Persist only meaningful PR changes; UpdatedAt differs on every refresh.
	if pr != nil && prMeaningfullyChanged(previousPullRequest, pr) {
		go t.persistPullRequest(ws.ID, pr)
	}
	if pr == nil && previousPullRequest != nil {
		go t.resolvePullRequest(ws.ID, previousPullRequest.Number)
	}
}

func (t *Tracker) applyRefreshedPullRequest(
	ws workspace.Workspace,
	pr *workspace.WorkspacePullRequest,
	keepActive bool,
) (*workspace.WorkspacePullRequest, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()

	trackedWorkspace, isTracked := t.active[ws.ID]
	currentWorkspace, isOpen := t.instances.Get(ws.ID)
	if !isTrackedRefreshWorkspace(ws, trackedWorkspace, currentWorkspace, isTracked, isOpen) {
		return nil, false
	}
	previousPullRequest := currentWorkspace.PullRequest
	if err := t.instances.SetPullRequest(ws.ID, pr); err != nil {
		return nil, false
	}
	if keepActive {
		ws.PullRequest = pr
		t.active[ws.ID] = ws
	} else {
		delete(t.active, ws.ID)
	}
	return previousPullRequest, true
}

func isTrackedRefreshWorkspace(
	refreshed, tracked, current workspace.Workspace,
	isTracked, isOpen bool,
) bool {
	return isTracked && isOpen &&
		tracked.Path == refreshed.Path && tracked.Kind != workspace.KindFolder &&
		current.Path == refreshed.Path && current.Kind != workspace.KindFolder
}

// setWorkspacePullRequest clears state for an ineligible workspace before it
// enters the active tracking set. Unlike a refresh result, this transition
// does not require active tracking.
func (t *Tracker) setWorkspacePullRequest(ws workspace.Workspace, pr *workspace.WorkspacePullRequest, keepActive bool) {
	previousPullRequest := ws.PullRequest
	if err := t.instances.SetPullRequest(ws.ID, pr); err != nil {
		return
	}
	if prMeaningfullyChanged(previousPullRequest, pr) && t.onPullRequestUpdated != nil {
		t.onPullRequestUpdated(PullRequestUpdatedEvent{
			WorkspaceID:           ws.ID,
			WorkspaceWorktreePath: ws.Path,
			PullRequest:           pr,
		})
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if keepActive {
		if _, ok := t.active[ws.ID]; ok {
			ws.PullRequest = pr
			t.active[ws.ID] = ws
		}
	} else {
		delete(t.active, ws.ID)
	}

	if pr != nil && prMeaningfullyChanged(previousPullRequest, pr) {
		go t.persistPullRequest(ws.ID, pr)
	}
	if pr == nil && previousPullRequest != nil {
		go t.resolvePullRequest(ws.ID, previousPullRequest.Number)
	}
}

// shouldErrDisableTracking reports whether a PR-resolution error means the
// repository has no PR support (unknown host, no remote), in which case
// tracking is disabled rather than retried.
func shouldErrDisableTracking(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, ghUnknownGitHubHostErrorFragment) ||
		strings.Contains(message, "no git remote") ||
		strings.Contains(message, "no remotes")
}

// shouldDisableTrackingForBranchError reports whether a branch-resolution
// error means the workspace cannot be on a tracked branch (detached/unknown
// HEAD), in which case tracking is disabled rather than retried.
func shouldDisableTrackingForBranchError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "workspace is not on a branch") ||
		strings.Contains(message, "ambiguous argument 'head'") ||
		strings.Contains(message, "unknown revision or path not in the working tree")
}
