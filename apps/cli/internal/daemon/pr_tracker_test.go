package daemon

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"yishan/apps/cli/internal/workspace"
)

func TestWorkspacePRTracker_BindsActivePullRequest(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error) {
		return workspace.GitBranchPullRequestStatus{
			Found:          true,
			Number:         42,
			Title:          "Add tracker",
			URL:            "https://github.com/acme/repo/pull/42",
			State:          "OPEN",
			ReviewDecision: "REVIEW_REQUIRED",
			HeadRefName:    "feature/test",
			BaseRefName:    "main",
		}, nil
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, err := manager.GetWorkspace(ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if updated.PullRequest == nil {
		t.Fatal("expected bound pull request")
	}
	if updated.PullRequest.Status != "review" {
		t.Fatalf("expected review status, got %+v", updated.PullRequest)
	}
	if _, ok := tracker.active[ws.ID]; !ok {
		t.Fatalf("expected workspace %q to remain active", ws.ID)
	}
}

func TestWorkspacePRTracker_StopsTrackingMergedPullRequest(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error) {
		return workspace.GitBranchPullRequestStatus{
			Found:       true,
			Number:      99,
			Title:       "Merged PR",
			URL:         "https://github.com/acme/repo/pull/99",
			State:       "MERGED",
			MergedAt:    "2026-01-01T00:00:00Z",
			HeadRefName: "feature/test",
			BaseRefName: "main",
		}, nil
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, err := manager.GetWorkspace(ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if updated.PullRequest == nil || updated.PullRequest.Status != "merged" || !updated.PullRequest.Complete {
		t.Fatalf("expected merged completed pull request, got %+v", updated.PullRequest)
	}
	if _, ok := tracker.active[ws.ID]; ok {
		t.Fatalf("expected workspace %q to be removed from active set", ws.ID)
	}
}

func TestWorkspacePRTracker_ClearsMissingPullRequest(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	if err := manager.SetWorkspacePullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetWorkspacePullRequest: %v", err)
	}
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error) {
		return workspace.GitBranchPullRequestStatus{Found: false}, nil
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, err := manager.GetWorkspace(ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if updated.PullRequest != nil {
		t.Fatalf("expected pull request to be cleared, got %+v", updated.PullRequest)
	}
	// When no PR is found the workspace stays active so future PRs can be detected.
	if _, ok := tracker.active[ws.ID]; !ok {
		t.Fatalf("expected workspace %q to remain active when no PR found", ws.ID)
	}
}

func TestWorkspacePRTracker_DisablesTrackingForNonGitHubRepository(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	if err := manager.SetWorkspacePullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetWorkspacePullRequest: %v", err)
	}
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error) {
		return workspace.GitBranchPullRequestStatus{}, errors.New("none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`")
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, err := manager.GetWorkspace(ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if updated.PullRequest != nil {
		t.Fatalf("expected pull request to be cleared for non-GitHub repo, got %+v", updated.PullRequest)
	}
	if _, ok := tracker.active[ws.ID]; ok {
		t.Fatalf("expected workspace %q to be removed from active set", ws.ID)
	}
}

func TestWorkspacePRTracker_SkipsOverlappingRefreshes(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	var resolverCalls atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	tracker.detailResolver = func(context.Context, string, string) (workspace.GitBranchPullRequestStatus, error) {
		resolverCalls.Add(1)
		started <- struct{}{}
		<-release
		return workspace.GitBranchPullRequestStatus{Found: false}, nil
	}

	// Start goroutine 1 and wait until it is inside detailResolver so that
	// the in-flight guard is definitely set before goroutine 2 starts.
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		tracker.RefreshWorkspaceByPath(ws.Path)
	}()
	<-started // goroutine 1 holds the in-flight lock

	// Goroutine 2 must see the in-flight guard and skip without calling detailResolver.
	done := make(chan struct{})
	go func() {
		tracker.RefreshWorkspaceByPath(ws.Path)
		close(done)
	}()
	<-done // goroutine 2 returns immediately (skipped)

	// Let goroutine 1 finish.
	close(release)
	wg.Wait()

	if got := resolverCalls.Load(); got != 1 {
		t.Fatalf("expected one resolver call, got %d", got)
	}
}

func TestWorkspacePRTracker_ClearsPullRequestWhenHeadCannotBeResolved(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	if err := manager.SetWorkspacePullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetWorkspacePullRequest: %v", err)
	}

	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "", errors.New("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree")
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, err := manager.GetWorkspace(ws.ID)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if updated.PullRequest != nil {
		t.Fatalf("expected pull request to be cleared when HEAD is unresolved, got %+v", updated.PullRequest)
	}
	if _, ok := tracker.active[ws.ID]; ok {
		t.Fatalf("expected workspace %q to be removed from active set", ws.ID)
	}
}

func TestWorkspacePRTracker_EnsureTrackedSkipsUnsupportedProvider(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.inspectResolver = func(context.Context, string) (workspace.GitInspectResult, error) {
		return workspace.GitInspectResult{
			IsGitRepository: true,
			RemoteURL:       "git@bitbucket.org:acme/repo.git",
			CurrentBranch:   "feature/test",
		}, nil
	}

	tracker.EnsureTracked(ws.Path, true)
	time.Sleep(30 * time.Millisecond)

	trackerHasWorkspace := false
	tracker.mu.Lock()
	_, trackerHasWorkspace = tracker.active[ws.ID]
	tracker.mu.Unlock()
	if trackerHasWorkspace {
		t.Fatalf("expected workspace %q to remain untracked for unsupported provider", ws.ID)
	}
}

func TestWorkspacePRTracker_EnsureTrackedSkipsWorkspaceWithoutRemote(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil, nil)
	tracker.inspectResolver = func(context.Context, string) (workspace.GitInspectResult, error) {
		return workspace.GitInspectResult{
			IsGitRepository: true,
			CurrentBranch:   "feature/test",
		}, nil
	}

	tracker.EnsureTracked(ws.Path, true)
	time.Sleep(30 * time.Millisecond)

	tracker.mu.Lock()
	_, tracked := tracker.active[ws.ID]
	tracker.mu.Unlock()
	if tracked {
		t.Fatalf("expected workspace %q to remain untracked without remote", ws.ID)
	}
}

func openTrackedWorkspace(t *testing.T) (*workspace.Manager, workspace.Workspace) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	manager := workspace.NewManager()
	ws, err := manager.Open(workspace.OpenRequest{ID: "workspace-1", Path: root})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return manager, ws
}
