package daemon

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
)

const workspacePullRequestPollInterval = 5 * time.Minute

type workspacePRTracker struct {
	mu             sync.Mutex
	manager        *workspace.Manager
	active         map[string]bool
	inFlight       map[string]bool
	started        bool
	done           chan struct{}
	publish        func(frontendEvent)
	branchResolver func(context.Context, string) (string, error)
	prResolver     func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error)
	detailResolver func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error)
}

func newWorkspacePRTracker(manager *workspace.Manager, publish func(frontendEvent)) *workspacePRTracker {
	tracker := &workspacePRTracker{
		manager:  manager,
		active:   make(map[string]bool),
		inFlight: make(map[string]bool),
		done:     make(chan struct{}),
		publish:  publish,
	}
	tracker.branchResolver = func(ctx context.Context, root string) (string, error) {
		ws, ok := manager.FindWorkspaceByPath(root)
		if !ok {
			return "", workspace.NewRPCError(rpcCodeNotFound, "workspace not found")
		}
		return manager.GitCurrentBranch(ctx, ws.ID)
	}
	tracker.prResolver = func(ctx context.Context, root string, branch string) (workspace.GitBranchPullRequestStatus, error) {
		ws, ok := manager.FindWorkspaceByPath(root)
		if !ok {
			return workspace.GitBranchPullRequestStatus{}, workspace.NewRPCError(rpcCodeNotFound, "workspace not found")
		}
		return manager.GitBranchPullRequestLite(ctx, ws.ID, branch)
	}
	tracker.detailResolver = func(ctx context.Context, root string, branch string) (workspace.GitBranchPullRequestStatus, error) {
		ws, ok := manager.FindWorkspaceByPath(root)
		if !ok {
			return workspace.GitBranchPullRequestStatus{}, workspace.NewRPCError(rpcCodeNotFound, "workspace not found")
		}
		return manager.GitBranchPullRequestWithDetails(ctx, ws.ID, branch)
	}
	return tracker
}

func (t *workspacePRTracker) EnsureTracked(worktreePath string) {
	if strings.TrimSpace(worktreePath) == "" {
		return
	}

	ws, ok := t.manager.FindWorkspaceByPath(worktreePath)
	if !ok {
		return
	}

	t.mu.Lock()
	if !t.started {
		t.started = true
		go t.pollLoop()
	}
	t.active[ws.ID] = true
	t.mu.Unlock()

	go t.RefreshWorkspaceByPath(worktreePath)
}

// EnsureTrackedSkipInitialRefresh registers the workspace for future PR polling
// without firing an immediate GitHub API call. Use this when the latest PR state
// is already known (e.g. already merged) but polling should resume for new PRs.
func (t *workspacePRTracker) EnsureTrackedSkipInitialRefresh(worktreePath string) {
	if strings.TrimSpace(worktreePath) == "" {
		return
	}

	ws, ok := t.manager.FindWorkspaceByPath(worktreePath)
	if !ok {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if !t.started {
		t.started = true
		go t.pollLoop()
	}
	t.active[ws.ID] = true
}

func (t *workspacePRTracker) StopTracking(workspaceID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.active, workspaceID)
}

// Stop shuts down the background poll loop. It is safe to call multiple times.
func (t *workspacePRTracker) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()
	select {
	case <-t.done:
		// already closed
	default:
		close(t.done)
	}
}

func (t *workspacePRTracker) RefreshWorkspaceByPath(worktreePath string) {
	ws, ok := t.manager.FindWorkspaceByPath(worktreePath)
	if !ok {
		log.Warn().Str("path", worktreePath).Msg("workspace PR refresh skipped because workspace path is not open")
		return
	}

	t.mu.Lock()
	tracked := t.active[ws.ID]
	t.mu.Unlock()
	if !tracked {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh skipped because workspace is no longer active")
		return
	}

	if !t.beginRefresh(ws.ID) {
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh skipped because another refresh is already running")
		return
	}
	defer t.endRefresh(ws.ID)
	if err := t.refreshWorkspace(ws); err != nil {
		log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("failed to refresh workspace pull request state")
	}
}

func (t *workspacePRTracker) pollLoop() {
	ticker := time.NewTicker(workspacePullRequestPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-t.done:
			log.Debug().Msg("workspace PR tracker poll loop stopped")
			return
		case <-ticker.C:
		}

		for _, ws := range t.manager.List() {
			t.mu.Lock()
			tracked := t.active[ws.ID]
			t.mu.Unlock()
			if !tracked {
				continue
			}
			if !t.beginRefresh(ws.ID) {
				continue
			}

			if err := t.refreshWorkspace(ws); err != nil {
				log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("failed to poll workspace pull request state")
			}
			t.endRefresh(ws.ID)
		}
	}
}

func (t *workspacePRTracker) beginRefresh(workspaceID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.inFlight[workspaceID] {
		return false
	}
	t.inFlight[workspaceID] = true
	return true
}

func (t *workspacePRTracker) endRefresh(workspaceID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.inFlight, workspaceID)
}

func (t *workspacePRTracker) refreshWorkspace(ws workspace.Workspace) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	branch, err := t.branchResolver(ctx, ws.Path)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh failed to resolve branch")
		return err
	}
	branch = strings.TrimSpace(branch)
	log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh resolved branch")
	if branch == "" || branch == "HEAD" {
		t.setWorkspacePullRequest(ws.ID, nil, true)
		log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh cleared PR because branch is empty or detached")
		return nil
	}

	pr, err := t.detailResolver(ctx, ws.Path, branch)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh failed to resolve pull request")
		return err
	}
	if !pr.Found {
		t.setWorkspacePullRequest(ws.ID, nil, true)
		log.Info().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh found no pull request")
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
	t.setWorkspacePullRequest(ws.ID, bound, !complete)
	log.Info().
		Str("workspaceId", ws.ID).
		Str("path", ws.Path).
		Str("branch", branch).
		Int("pullRequestNumber", pr.Number).
		Str("pullRequestStatus", status).
		Bool("complete", complete).
		Msg("workspace PR refresh synced pull request")
	return nil
}

func (t *workspacePRTracker) setWorkspacePullRequest(workspaceID string, pr *workspace.WorkspacePullRequest, keepActive bool) {
	previousWorkspace, previousErr := t.manager.GetWorkspace(workspaceID)
	previousPullRequest := previousWorkspace.PullRequest
	if err := t.manager.SetWorkspacePullRequest(workspaceID, pr); err != nil {
		return
	}
	if previousErr == nil && !reflect.DeepEqual(previousPullRequest, pr) {
		if currentWorkspace, err := t.manager.GetWorkspace(workspaceID); err == nil && t.publish != nil {
			t.publish(frontendEvent{
				Topic: "workspacePullRequestUpdated",
				Payload: map[string]any{
					"workspaceId":           currentWorkspace.ID,
					"workspaceWorktreePath": currentWorkspace.Path,
					"pullRequest":           pr,
				},
			})
		}
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	if keepActive {
		t.active[workspaceID] = true
	} else {
		delete(t.active, workspaceID)
	}

	// Persist to api-service only when meaningful PR fields changed (excluding
	// UpdatedAt which is set on every refresh and would always differ).
	if pr != nil && previousErr == nil && prMeaningfullyChanged(previousPullRequest, pr) {
		go t.persistPullRequest(workspaceID, pr)
	}
}

// prMeaningfullyChanged returns true when the PR fields that matter for
// persistence have changed, ignoring UpdatedAt which is always refreshed.
func prMeaningfullyChanged(prev, next *workspace.WorkspacePullRequest) bool {
	if prev == nil {
		return true
	}
	return prev.Number != next.Number ||
		prev.Title != next.Title ||
		prev.URL != next.URL ||
		prev.Branch != next.Branch ||
		prev.BaseBranch != next.BaseBranch ||
		prev.GitHubState != next.GitHubState ||
		prev.Status != next.Status ||
		prev.ReviewDecision != next.ReviewDecision ||
		prev.IsDraft != next.IsDraft ||
		prev.Complete != next.Complete ||
		!reflect.DeepEqual(prev.Checks, next.Checks) ||
		!reflect.DeepEqual(prev.Deployments, next.Deployments)
}

func normalizeWorkspacePullRequestStatus(pr workspace.GitBranchPullRequestStatus) string {
	state := strings.ToUpper(strings.TrimSpace(pr.State))
	if state == "MERGED" || strings.TrimSpace(pr.MergedAt) != "" {
		return "merged"
	}
	if pr.IsDraft {
		return "draft"
	}
	if strings.EqualFold(strings.TrimSpace(pr.ReviewDecision), "REVIEW_REQUIRED") {
		return "review"
	}
	if state == "OPEN" {
		return "open"
	}
	if state == "CLOSED" {
		return "closed"
	}
	return strings.ToLower(state)
}

// persistPullRequest writes a PR snapshot to the api-service.
// Called in a goroutine; failures are logged and do not affect local state.
func (t *workspacePRTracker) persistPullRequest(workspaceID string, pr *workspace.WorkspacePullRequest) {
	if !cliruntime.APIConfigured() {
		return
	}

	ws, err := t.manager.GetWorkspace(workspaceID)
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("pr persist: workspace not found")
		return
	}
	if ws.OrgID == "" || ws.ProjectID == "" {
		log.Debug().Str("workspaceId", workspaceID).Msg("pr persist: skipped — orgId or projectId not set on workspace")
		return
	}

	// Map daemon status to api-service state.
	state := pr.Status
	if state == "draft" || state == "review" {
		state = "open"
	}
	if state != "open" && state != "closed" && state != "merged" {
		state = "open"
	}

	resolvedAt := ""
	if state == "merged" || state == "closed" {
		resolvedAt = nowRFC3339Nano()
	}

	metadata := map[string]any{
		"isDraft":        pr.IsDraft,
		"reviewDecision": pr.ReviewDecision,
	}
	if len(pr.Checks) > 0 {
		checks := make([]map[string]any, 0, len(pr.Checks))
		for _, c := range pr.Checks {
			checks = append(checks, map[string]any{
				"name":        c.Name,
				"workflow":    c.Workflow,
				"state":       c.State,
				"description": c.Description,
				"url":         c.URL,
			})
		}
		metadata["checks"] = checks
	}
	if len(pr.Deployments) > 0 {
		deployments := make([]map[string]any, 0, len(pr.Deployments))
		for _, d := range pr.Deployments {
			deployments = append(deployments, map[string]any{
				"id":             d.ID,
				"environment":    d.Environment,
				"state":          d.State,
				"description":    d.Description,
				"environmentUrl": d.EnvironmentURL,
			})
		}
		metadata["deployments"] = deployments
	}

	input := api.UpsertWorkspacePullRequestInput{
		PrID:       fmt.Sprintf("%d", pr.Number),
		Title:      pr.Title,
		URL:        pr.URL,
		Branch:     pr.Branch,
		BaseBranch: pr.BaseBranch,
		State:      state,
		Metadata:   metadata,
		DetectedAt: pr.UpdatedAt,
		ResolvedAt: resolvedAt,
	}

	if _, err := cliruntime.APIClient().UpsertWorkspacePullRequest(ws.OrgID, ws.ProjectID, workspaceID, input); err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Str("prId", input.PrID).Str("state", state).Msg("pr persist: failed to upsert to api-service")
		return
	}
	log.Info().Str("workspaceId", workspaceID).Str("prId", input.PrID).Str("state", state).Msg("pr persist: upserted to api-service")
}
