package daemon

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

func TestWorkspacePRTracker_BindsActivePullRequest(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil)
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
	tracker := newWorkspacePRTracker(manager, nil)
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
	tracker := newWorkspacePRTracker(manager, nil)
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

func TestWorkspacePRTracker_SkipsNonGitHubRepositoryPullRequestLookup(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	if err := manager.SetWorkspacePullRequest(ws.ID, &workspace.WorkspacePullRequest{Number: 1, Status: "open"}); err != nil {
		t.Fatalf("SetWorkspacePullRequest: %v", err)
	}
	tracker := newWorkspacePRTracker(manager, nil)
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
	if _, ok := tracker.active[ws.ID]; !ok {
		t.Fatalf("expected workspace %q to remain active for future checks", ws.ID)
	}
}

func TestWorkspacePRTracker_SkipsOverlappingRefreshes(t *testing.T) {
	manager, ws := openTrackedWorkspace(t)
	tracker := newWorkspacePRTracker(manager, nil)
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

	done := make(chan struct{})
	go tracker.RefreshWorkspaceByPath(ws.Path)
	go func() {
		tracker.RefreshWorkspaceByPath(ws.Path)
		close(done)
	}()
	<-started
	close(release)
	<-done

	if got := resolverCalls.Load(); got != 1 {
		t.Fatalf("expected one resolver call, got %d", got)
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
