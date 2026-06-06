package workspace

import "context"

func (m *Manager) GitStatus(ctx context.Context, workspaceID string) (GitStatusResponse, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitStatusResponse{}, err
	}
	return handle.GitStatus(ctx)
}

func (m *Manager) GitInspect(ctx context.Context, path string) (GitInspectResult, error) {
	return m.gits.Inspect(ctx, path)
}

func (m *Manager) SyncRepoSource(ctx context.Context, repoPath string) error {
	return updateGitRepo(ctx, repoPath)
}

func (m *Manager) GitListChanges(ctx context.Context, workspaceID string) (GitChangesBySection, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitChangesBySection{}, err
	}
	return handle.GitListChanges(ctx)
}

func (m *Manager) GitTrackChanges(ctx context.Context, workspaceID string, paths []string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitTrackChanges(ctx, paths)
}

func (m *Manager) GitUnstageChanges(ctx context.Context, workspaceID string, paths []string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitUnstageChanges(ctx, paths)
}

func (m *Manager) GitRevertChanges(ctx context.Context, workspaceID string, paths []string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitRevertChanges(ctx, paths)
}

func (m *Manager) GitCommitChanges(ctx context.Context, workspaceID string, message string, amend bool, signoff bool) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitCommitChanges(ctx, message, amend, signoff)
}

func (m *Manager) GitBranchStatus(ctx context.Context, workspaceID string) (GitBranchStatus, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchStatus{}, err
	}
	return handle.GitBranchStatus(ctx)
}

func (m *Manager) GitBranchPullRequest(ctx context.Context, workspaceID string, branch string) (GitBranchPullRequestStatus, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchPullRequestStatus{}, err
	}
	return handle.GitBranchPullRequest(ctx, branch)
}

func (m *Manager) RefreshGitBranchPullRequest(ctx context.Context, workspaceID string, branch string) (GitBranchPullRequestStatus, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchPullRequestStatus{}, err
	}
	return handle.RefreshGitBranchPullRequest(ctx, branch)
}

func (m *Manager) GitBranchPullRequestLite(ctx context.Context, workspaceID string, branch string) (GitBranchPullRequestStatus, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchPullRequestStatus{}, err
	}
	return handle.GitBranchPullRequestLite(ctx, branch)
}

func (m *Manager) GitBranchPullRequestWithDetails(ctx context.Context, workspaceID string, branch string) (GitBranchPullRequestStatus, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchPullRequestStatus{}, err
	}
	return handle.GitBranchPullRequestWithDetails(ctx, branch)
}

func (m *Manager) GitCurrentBranch(ctx context.Context, workspaceID string) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitCurrentBranch(ctx)
}

func (m *Manager) GitListCommitsToTarget(ctx context.Context, workspaceID string, targetBranch string) (GitCommitComparison, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitCommitComparison{}, err
	}
	return handle.GitListCommitsToTarget(ctx, targetBranch)
}

func (m *Manager) GitBranchDiffSummary(ctx context.Context, workspaceID string, targetBranch string) (GitBranchDiffSummary, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchDiffSummary{}, err
	}
	return handle.GitBranchDiffSummary(ctx, targetBranch)
}

func (m *Manager) GitReadCommitDiff(ctx context.Context, workspaceID string, commitHash string, path string) (GitDiffContent, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitDiffContent{}, err
	}
	return handle.GitReadCommitDiff(ctx, commitHash, path)
}

func (m *Manager) GitReadBranchComparisonDiff(ctx context.Context, workspaceID string, targetBranch string, path string) (GitDiffContent, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitDiffContent{}, err
	}
	return handle.GitReadBranchComparisonDiff(ctx, targetBranch, path)
}

func (m *Manager) GitListBranches(ctx context.Context, workspaceID string) (GitBranchList, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitBranchList{}, err
	}
	return handle.GitListBranches(ctx)
}

func (m *Manager) GitPushBranch(ctx context.Context, workspaceID string) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitPushBranch(ctx)
}

func (m *Manager) GitPublishBranch(ctx context.Context, workspaceID string) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitPublishBranch(ctx)
}

func (m *Manager) GitRenameBranch(ctx context.Context, workspaceID string, nextBranch string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitRenameBranch(ctx, nextBranch)
}

func (m *Manager) GitRemoveBranch(ctx context.Context, workspaceID string, branch string, force bool) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitRemoveBranch(ctx, branch, force)
}

func (m *Manager) GitPrMerge(ctx context.Context, workspaceID string, prNumber int, method string, deleteBranch bool) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitPrMerge(ctx, prNumber, method, deleteBranch)
}

func (m *Manager) GitPrClose(ctx context.Context, workspaceID string, prNumber int) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitPrClose(ctx, prNumber)
}

func (m *Manager) GitCreateWorktree(ctx context.Context, workspaceID string, branch string, worktreePath string, createBranch bool, fromRef string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitCreateWorktree(ctx, branch, worktreePath, createBranch, fromRef)
}

func (m *Manager) GitRemoveWorktree(ctx context.Context, workspaceID string, worktreePath string, force bool) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.GitRemoveWorktree(ctx, worktreePath, force)
}

func (m *Manager) GitAuthorName(ctx context.Context, workspaceID string) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.GitAuthorName(ctx)
}
