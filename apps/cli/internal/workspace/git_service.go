package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// GitService provides git operations for workspaces.
// Methods are grouped into focused files:
//   - git_changes.go  — ListChanges, TrackChanges, UnstageChanges, RevertChanges, CommitChanges
//   - git_branch.go   — BranchStatus, ListBranches, CurrentBranch, AuthorName, MainWorktreePath,
//     PushBranch, PublishBranch, RenameBranch, RemoveBranch, FetchRef,
//     ListCommitsToTarget, BranchDiffSummary, ReadCommitDiff, ReadBranchComparisonDiff
//   - git_pr.go       — BranchPullRequest, BranchPullRequestWithDetails, branchPullRequest,
//     getPullRequestChecks, getPullRequestDeployments, getDeploymentStatus
//   - git_worktree.go — CreateWorktree, RemoveWorktree
//   - git_exec.go     — gitCommand, gitCommandCombined, ghCommand, ghJSON, parseNumstat,
//     parseStatusOutput, helper functions
type GitService struct {
	mu                     sync.RWMutex
	branchCache            map[string]branchCacheEntry
	branchPullRequestCache map[string]branchPullRequestCacheEntry
}

func NewGitService() *GitService {
	return &GitService{
		branchCache:            make(map[string]branchCacheEntry),
		branchPullRequestCache: make(map[string]branchPullRequestCacheEntry),
	}
}

func (s *GitService) Status(ctx context.Context, root string) (GitStatusResponse, error) {
	out, err := gitCommand(ctx, root, "status", "--porcelain", "--branch")
	if err != nil {
		return GitStatusResponse{}, err
	}
	return parseStatusOutput(out), nil
}

func (s *GitService) Inspect(ctx context.Context, path string) (GitInspectResult, error) {
	candidatePath := strings.TrimSpace(path)
	if candidatePath == "" {
		return GitInspectResult{}, NewRPCError(-32602, "path is required")
	}

	absPath, err := filepath.Abs(candidatePath)
	if err != nil {
		return GitInspectResult{}, err
	}

	statInfo, err := os.Stat(absPath)
	if err == nil && !statInfo.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	topLevel, err := gitCommand(ctx, absPath, "rev-parse", "--show-toplevel")
	if err != nil || strings.TrimSpace(topLevel) == "" {
		return GitInspectResult{IsGitRepository: false}, nil
	}

	repoRoot := strings.TrimSpace(topLevel)
	remoteURL, _ := gitCommand(ctx, repoRoot, "config", "--get", "remote.origin.url")
	currentBranch, _ := gitCommand(ctx, repoRoot, "rev-parse", "--abbrev-ref", "HEAD")

	return GitInspectResult{
		IsGitRepository: true,
		RemoteURL:       strings.TrimSpace(remoteURL),
		CurrentBranch:   strings.TrimSpace(currentBranch),
	}, nil
}
