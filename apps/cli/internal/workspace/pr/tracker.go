package pr

import (
	"context"

	"strings"
	"sync"
	"time"
	"yishan/apps/cli/internal/git"

	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"

	"github.com/rs/zerolog/log"
)

const workspacePullRequestPollInterval = 5 * time.Minute

const ghUnknownGitHubHostErrorFragment = "none of the git remotes configured for this repository point to a known github host"

type PullRequestUpdatedEvent struct {
	WorkspaceID           string
	WorkspaceWorktreePath string
	PullRequest           *workspace.WorkspacePullRequest
}

type Tracker struct {
	mu      sync.Mutex
	gits    *git.GitService
	instances *instance.Registry
	runtime *cliruntime.Runtime
	// active maps workspaceID → Workspace for all workspaces currently being
	// tracked. Storing the full Workspace avoids calling registry.List() on
	// every poll tick and filtering by active map membership.
	active               map[string]workspace.Workspace
	inFlight             map[string]bool
	started              bool
	done                 chan struct{}
	onPullRequestUpdated func(PullRequestUpdatedEvent)
	persistPR            func(context.Context, string, *workspace.WorkspacePullRequest) error
	resolvePR            func(context.Context, string, int) error
	inspectResolver      func(context.Context, string) (git.GitInspectResult, error)
	branchResolver       func(context.Context, string) (string, error)
	prResolver           func(context.Context, string, string) (git.GitBranchPullRequestStatus, error)
	detailResolver       func(context.Context, string, string) (git.GitBranchPullRequestStatus, error)
}

// TrackerDeps wires the tracker. Instances provides open-instance lookup and
// PR state writes; Gits is the shared git service; persistPR/resolvePR are the
// durable PR persistence hooks (SQLite-backed, owned by the composition root).
type TrackerDeps struct {
	Instances            *instance.Registry
	Gits                 *git.GitService
	Runtime              *cliruntime.Runtime
	PersistPR            func(context.Context, string, *workspace.WorkspacePullRequest) error
	ResolvePR            func(context.Context, string, int) error
	OnPullRequestUpdated func(PullRequestUpdatedEvent)
}

func New(deps TrackerDeps) *Tracker {
	tracker := &Tracker{
		gits:                 deps.Gits,
		instances:            deps.Instances,
		runtime:              deps.Runtime,
		active:               make(map[string]workspace.Workspace),
		inFlight:             make(map[string]bool),
		done:                 make(chan struct{}),
		onPullRequestUpdated: deps.OnPullRequestUpdated,
		persistPR:            deps.PersistPR,
		resolvePR:            deps.ResolvePR,
	}
	tracker.branchResolver = func(ctx context.Context, root string) (string, error) {
		if _, ok := tracker.instances.GetByPath(root); !ok {
			return "", workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
		}
		return tracker.gits.CurrentBranch(ctx, root)
	}
	tracker.inspectResolver = func(ctx context.Context, root string) (git.GitInspectResult, error) {
		return tracker.gits.Inspect(ctx, root)
	}
	tracker.prResolver = func(ctx context.Context, root string, branch string) (git.GitBranchPullRequestStatus, error) {
		if _, ok := tracker.instances.GetByPath(root); !ok {
			return git.GitBranchPullRequestStatus{}, workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
		}
		return tracker.gits.BranchPullRequestLite(ctx, root, branch)
	}
	tracker.detailResolver = func(ctx context.Context, root string, branch string) (git.GitBranchPullRequestStatus, error) {
		if _, ok := tracker.instances.GetByPath(root); !ok {
			return git.GitBranchPullRequestStatus{}, workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
		}
		return tracker.gits.BranchPullRequestWithDetails(ctx, root, branch)
	}
	return tracker
}

func (t *Tracker) EnsureTracked(worktreePath string, refreshImmediately bool) {
	if strings.TrimSpace(worktreePath) == "" {
		return
	}

	ws, ok := t.instances.GetByPath(worktreePath)
	if !ok {
		return
	}

	if !t.shouldTrackWorkspacePullRequest(ws) {
		t.setWorkspacePullRequest(ws, nil, false)
		return
	}

	t.mu.Lock()
	if !t.started {
		t.started = true
		go t.pollLoop()
	}
	t.active[ws.ID] = ws
	t.mu.Unlock()

	if refreshImmediately {
		go t.RefreshWorkspaceByPath(worktreePath)
	}
}

func (t *Tracker) StopTracking(workspaceID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.active, workspaceID)
}

// Stop shuts down the background poll loop. It is safe to call multiple times.
func (t *Tracker) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()
	select {
	case <-t.done:
		// already closed
	default:
		close(t.done)
	}
}

func (t *Tracker) RefreshWorkspaceByPath(worktreePath string) {
	ws, ok := t.instances.GetByPath(worktreePath)
	if !ok {
		log.Warn().Str("path", worktreePath).Msg("workspace PR refresh skipped because workspace path is not open")
		return
	}

	t.mu.Lock()
	_, tracked := t.active[ws.ID]
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

func (t *Tracker) pollLoop() {
	ticker := time.NewTicker(workspacePullRequestPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-t.done:
			log.Debug().Msg("workspace PR tracker poll loop stopped")
			return
		case <-ticker.C:
		}

		t.mu.Lock()
		// Snapshot the tracked workspaces under the lock, then release before
		// making network calls. This avoids holding mu during the gh CLI calls.
		tracked := make([]workspace.Workspace, 0, len(t.active))
		for _, ws := range t.active {
			tracked = append(tracked, ws)
		}
		t.mu.Unlock()

		for _, ws := range tracked {
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

func (t *Tracker) beginRefresh(workspaceID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.inFlight[workspaceID] {
		return false
	}
	t.inFlight[workspaceID] = true
	return true
}

func (t *Tracker) endRefresh(workspaceID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.inFlight, workspaceID)
}

func (t *Tracker) refreshWorkspace(ws workspace.Workspace) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	branch, err := t.branchResolver(ctx, ws.Path)
	if err != nil {
		if shouldDisableTrackingForBranchError(err) {
			t.setWorkspacePullRequest(ws, nil, false)
			log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh disabled tracking because branch could not be resolved")
			return nil
		}
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh failed to resolve branch")
		return err
	}
	branch = strings.TrimSpace(branch)
	log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh resolved branch")
	if branch == "" || branch == "HEAD" {
		t.setWorkspacePullRequest(ws, nil, true)
		log.Debug().Str("workspaceId", ws.ID).Str("path", ws.Path).Msg("workspace PR refresh cleared PR because branch is empty or detached")
		return nil
	}

	pr, err := t.detailResolver(ctx, ws.Path, branch)
	if err != nil {
		if shouldErrDisableTracking(err) {
			t.setWorkspacePullRequest(ws, nil, false)
			log.Debug().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh disabled tracking for repository without PR support")
			return nil
		}
		log.Warn().Err(err).Str("workspaceId", ws.ID).Str("path", ws.Path).Str("branch", branch).Msg("workspace PR refresh failed to resolve pull request")
		return err
	}
	if !pr.Found {
		t.setWorkspacePullRequest(ws, nil, true)
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
	t.setWorkspacePullRequest(ws, bound, !complete)
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

func shouldErrDisableTracking(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, ghUnknownGitHubHostErrorFragment) ||
		strings.Contains(message, "no git remote") ||
		strings.Contains(message, "no remotes")
}

func shouldDisableTrackingForBranchError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "workspace is not on a branch") ||
		strings.Contains(message, "ambiguous argument 'head'") ||
		strings.Contains(message, "unknown revision or path not in the working tree")
}

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

	// Persist only meaningful PR changes; UpdatedAt differs on every refresh.
	if pr != nil && prMeaningfullyChanged(previousPullRequest, pr) {
		go t.persistPullRequest(ws.ID, pr)
	}
	if pr == nil && previousPullRequest != nil {
		go t.resolvePullRequest(ws.ID, previousPullRequest.Number)
	}
}

// prMeaningfullyChanged returns true when the PR fields that matter for
// persistence have changed, ignoring UpdatedAt which is always refreshed.
func prMeaningfullyChanged(prev, next *workspace.WorkspacePullRequest) bool {
	if prev == nil && next == nil {
		return false
	}
	if prev == nil || next == nil {
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
		!checksEqual(prev.Checks, next.Checks) ||
		!deploymentsEqual(prev.Deployments, next.Deployments)
}

// checksEqual compares two check slices field-by-field.
// Length-first comparison short-circuits the common case of different counts.
func checksEqual(a, b []git.GitPullRequestCheck) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Name != b[i].Name ||
			a[i].State != b[i].State ||
			a[i].Workflow != b[i].Workflow ||
			a[i].Description != b[i].Description ||
			a[i].URL != b[i].URL {
			return false
		}
	}
	return true
}

// deploymentsEqual compares two deployment slices field-by-field.
// Length-first comparison short-circuits the common case of different counts.
func deploymentsEqual(a, b []git.GitPullRequestDeployment) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID ||
			a[i].Environment != b[i].Environment ||
			a[i].State != b[i].State ||
			a[i].Description != b[i].Description ||
			a[i].EnvironmentURL != b[i].EnvironmentURL {
			return false
		}
	}
	return true
}

func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func normalizeWorkspacePullRequestStatus(pr git.GitBranchPullRequestStatus) string {
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

func (t *Tracker) resolvePullRequest(workspaceID string, pullRequestNumber int) {
	if t.resolvePR == nil {
		return
	}
	if err := t.resolvePR(context.Background(), workspaceID, pullRequestNumber); err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Msg("pr persist: failed to resolve locally")
	}
}
