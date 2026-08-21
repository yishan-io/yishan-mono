package pr

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

const workspacePullRequestPollInterval = 5 * time.Minute

const ghUnknownGitHubHostErrorFragment = "none of the git remotes configured for this repository point to a known github host"

// Tracker owns the pull-request polling lifecycle: the poll loop, the
// active-tracking set, and refresh coordination (one in-flight refresh per
// workspace). Git queries go through the resolver hooks wired in New (git
// provider seam), PR state transitions live in resolve.go, comparison logic
// in compare.go, persistence hooks in persist.go, and event types in
// events.go.
type Tracker struct {
	mu        sync.Mutex
	gits      *git.GitService
	instances *instance.Registry
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
	detailResolver       func(context.Context, string, string) (git.GitBranchPullRequestStatus, error)
}

// TrackerDeps wires the tracker. Instances provides open-instance lookup and
// PR state writes; Gits is the shared git service; persistPR/resolvePR are the
// durable PR persistence hooks (SQLite-backed, owned by the composition root).
type TrackerDeps struct {
	Instances            *instance.Registry
	Gits                 *git.GitService
	PersistPR            func(context.Context, string, *workspace.WorkspacePullRequest) error
	ResolvePR            func(context.Context, string, int) error
	OnPullRequestUpdated func(PullRequestUpdatedEvent)
	InspectResolver      func(context.Context, string) (git.GitInspectResult, error)
}

func New(deps TrackerDeps) *Tracker {
	tracker := &Tracker{
		gits:                 deps.Gits,
		instances:            deps.Instances,
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
	tracker.inspectResolver = deps.InspectResolver
	if tracker.inspectResolver == nil {
		tracker.inspectResolver = func(ctx context.Context, root string) (git.GitInspectResult, error) {
			return tracker.gits.Inspect(ctx, root)
		}
	}
	tracker.detailResolver = func(ctx context.Context, root string, branch string) (git.GitBranchPullRequestStatus, error) {
		if _, ok := tracker.instances.GetByPath(root); !ok {
			return git.GitBranchPullRequestStatus{}, workspace.NewError(workspace.ErrCodeNotFound, "workspace not found")
		}
		return tracker.gits.BranchPullRequestWithDetails(ctx, root, branch)
	}
	return tracker
}

// EnsureTracked starts the poll loop on first use and marks a workspace for
// continuous PR observation. Unsupported workspaces (non-git, no remote,
// unsupported provider) are rejected by the eligibility gate.
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

// StopTracking removes a workspace from the active-tracking set.
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

// RefreshWorkspaceByPath refreshes one tracked workspace's pull request
// outside the poll interval (e.g. on file-change watcher events).
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

// pollLoop ticks every workspacePullRequestPollInterval and refreshes every
// tracked workspace. It exits when Stop closes the done channel.
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

// beginRefresh marks a workspace refresh as in-flight, returning false when
// another refresh for the same workspace is already running.
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
