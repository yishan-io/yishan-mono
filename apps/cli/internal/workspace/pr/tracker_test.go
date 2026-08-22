package pr

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

func TestWorkspacePRTracker_BindsActivePullRequest(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{
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

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatalf("GetWorkspace: not found")
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
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{
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

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatalf("GetWorkspace: not found")
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
	if err := manager.SetPullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetPullRequest: %v", err)
	}
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{Found: false}, nil
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatalf("GetWorkspace: not found")
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
	if err := manager.SetPullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetPullRequest: %v", err)
	}
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{}, errors.New("none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`")
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatalf("GetWorkspace: not found")
	}
	if updated.PullRequest != nil {
		t.Fatalf("expected pull request to be cleared for non-GitHub repo, got %+v", updated.PullRequest)
	}
	if _, ok := tracker.active[ws.ID]; ok {
		t.Fatalf("expected workspace %q to be removed from active set", ws.ID)
	}
}

func TestWorkspacePRTracker_BlocksRefreshAfterWorkspaceIsReclassifiedAsFolder(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	var eventWrites atomic.Int32
	var persistWrites atomic.Int32
	tracker := New(TrackerDeps{
		Instances: manager,
		Gits:      git.NewGitService(),
		OnPullRequestUpdated: func(PullRequestUpdatedEvent) {
			eventWrites.Add(1)
		},
		PersistPR: func(context.Context, string, *workspace.WorkspacePullRequest) error {
			persistWrites.Add(1)
			return nil
		},
	})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	refreshStarted := make(chan struct{})
	releaseRefresh := make(chan struct{})
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		close(refreshStarted)
		<-releaseRefresh
		return git.GitBranchPullRequestStatus{
			Found: true, Number: 42, Title: "Stale PR", State: "OPEN", HeadRefName: "feature/test", BaseRefName: "main",
		}, nil
	}

	refreshDone := make(chan struct{})
	go func() {
		tracker.RefreshWorkspaceByPath(ws.Path)
		close(refreshDone)
	}()
	<-refreshStarted

	tracker.StopTracking(ws.ID)
	manager.Open(workspace.Workspace{ID: ws.ID, Path: ws.Path, Kind: workspace.KindFolder, State: workspace.StateActive})
	close(releaseRefresh)
	<-refreshDone

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatal("expected reclassified folder workspace to remain open")
	}
	if updated.PullRequest != nil {
		t.Fatalf("folder pull request = %#v, want nil", updated.PullRequest)
	}
	if got := eventWrites.Load(); got != 0 {
		t.Fatalf("event writes = %d, want 0", got)
	}
	if got := persistWrites.Load(); got != 0 {
		t.Fatalf("persist writes = %d, want 0", got)
	}
}

func TestWorkspacePRTracker_SkipsOverlappingRefreshes(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	var resolverCalls atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		resolverCalls.Add(1)
		started <- struct{}{}
		<-release
		return git.GitBranchPullRequestStatus{Found: false}, nil
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
	if err := manager.SetPullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetPullRequest: %v", err)
	}

	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "", errors.New("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree")
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	updated, ok := manager.Get(ws.ID)
	if !ok {
		t.Fatalf("GetWorkspace: not found")
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
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.inspectResolver = func(context.Context, string) (git.GitInspectResult, error) {
		return git.GitInspectResult{
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
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.inspectResolver = func(context.Context, string) (git.GitInspectResult, error) {
		return git.GitInspectResult{
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

func TestWorkspacePRTracker_PublishesTypedUpdateOnMeaningfulChange(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	published := make(chan PullRequestUpdatedEvent, 1)
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService(), OnPullRequestUpdated: func(event PullRequestUpdatedEvent) {
		published <- event
	}})
	tracker.active[ws.ID] = ws
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{
			Found:       true,
			Number:      42,
			Title:       "Add tracker",
			URL:         "https://github.com/acme/repo/pull/42",
			State:       "OPEN",
			HeadRefName: "feature/test",
			BaseRefName: "main",
		}, nil
	}

	tracker.RefreshWorkspaceByPath(ws.Path)

	select {
	case event := <-published:
		if event.WorkspaceID != ws.ID || event.WorkspaceWorktreePath != ws.Path {
			t.Fatalf("unexpected published event: %+v", event)
		}
		if event.PullRequest == nil || event.PullRequest.Number != 42 {
			t.Fatalf("unexpected pull request payload: %+v", event.PullRequest)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for typed pull request update")
	}
}

// TestWorkspacePRTracker_StopStopsPollLoop covers the shutdown exit
// criterion: Stop closes the poll loop's done channel so the background
// goroutine exits instead of polling forever.
func TestWorkspacePRTracker_StopStopsPollLoop(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.inspectResolver = func(context.Context, string) (git.GitInspectResult, error) {
		return git.GitInspectResult{
			IsGitRepository: true,
			RemoteURL:       "git@github.com:acme/repo.git",
			CurrentBranch:   "feature/test",
		}, nil
	}
	tracker.EnsureTracked(ws.Path, false)

	// Ensure the poll loop goroutine has actually started before stopping.
	tracker.mu.Lock()
	started := tracker.started
	tracker.mu.Unlock()
	if !started {
		t.Fatal("expected poll loop to be started by EnsureTracked")
	}

	tracker.Stop()
	tracker.Stop() // safe to call multiple times
	select {
	case <-tracker.done:
		// poll loop stop signal delivered
	default:
		t.Fatal("expected done channel to be closed after Stop")
	}
}

// TestWorkspacePRTracker_EnsureTrackedRefreshesImmediately covers the
// refreshImmediately flag: a tracked workspace gets an immediate refresh, not
// only the next poll tick.
func TestWorkspacePRTracker_EnsureTrackedRefreshesImmediately(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := New(TrackerDeps{Instances: manager, Gits: git.NewGitService()})
	tracker.inspectResolver = func(context.Context, string) (git.GitInspectResult, error) {
		return git.GitInspectResult{
			IsGitRepository: true,
			RemoteURL:       "git@github.com:acme/repo.git",
			CurrentBranch:   "feature/test",
		}, nil
	}
	tracker.branchResolver = func(context.Context, string) (string, error) {
		return "feature/test", nil
	}
	tracker.detailResolver = func(context.Context, string, string) (git.GitBranchPullRequestStatus, error) {
		return git.GitBranchPullRequestStatus{
			Found:       true,
			Number:      42,
			Title:       "Add tracker",
			URL:         "https://github.com/acme/repo/pull/42",
			State:       "OPEN",
			HeadRefName: "feature/test",
			BaseRefName: "main",
		}, nil
	}

	tracker.EnsureTracked(ws.Path, true)

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		updated, ok := manager.Get(ws.ID)
		if ok && updated.PullRequest != nil && updated.PullRequest.Number == 42 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("expected immediate refresh to bind the pull request")
}

func openTrackedWorkspace(t *testing.T) (*instance.Registry, workspace.Workspace) {
	t.Helper()
	root := t.TempDir()
	if resolved, err := filepath.EvalSymlinks(root); err == nil {
		root = resolved
	}
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	registry := instance.NewRegistry(files.NewFileService())
	ws := registry.Open(workspace.Workspace{ID: "workspace-1", Path: root, State: workspace.StateActive})
	return registry, ws
}
