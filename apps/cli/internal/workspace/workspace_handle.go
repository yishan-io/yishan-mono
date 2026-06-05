package workspace

import (
	"context"

	"yishan/apps/cli/internal/workspace/terminal"
)

type WorkspaceHandle struct {
	workspace Workspace
	files     *FileService
	gits      *GitService
	terminals *terminal.Manager
}

func (h WorkspaceHandle) Workspace() Workspace {
	return h.workspace
}

func (h WorkspaceHandle) FileList(path string, recursive bool) ([]FileEntry, error) {
	return h.files.List(h.workspace.Path, path, recursive)
}

func (h WorkspaceHandle) FileSearch(query string, limit int) ([]FileSearchResult, error) {
	return h.files.Search(h.workspace.Path, query, limit)
}

func (h WorkspaceHandle) FileStat(path string) (FileEntry, error) {
	return h.files.Stat(h.workspace.Path, path)
}

func (h WorkspaceHandle) FileRead(path string) (string, error) {
	return h.files.Read(h.workspace.Path, path)
}

func (h WorkspaceHandle) FileWrite(path string, content string, mode uint32) (int, error) {
	return h.files.Write(h.workspace.Path, path, content, mode)
}

func (h WorkspaceHandle) FileDelete(path string, recursive bool) error {
	return h.files.Delete(h.workspace.Path, path, recursive)
}

func (h WorkspaceHandle) FileMove(fromPath string, toPath string) error {
	return h.files.Move(h.workspace.Path, fromPath, toPath)
}

func (h WorkspaceHandle) FileMkdir(path string, parents bool, mode uint32) error {
	return h.files.Mkdir(h.workspace.Path, path, parents, mode)
}

func (h WorkspaceHandle) FileReadDiff(ctx context.Context, path string) (GitDiffContent, error) {
	return h.files.ReadDiff(ctx, h.workspace.Path, path)
}

func (h WorkspaceHandle) TerminalStart(ctx context.Context, req TerminalStartRequest) (TerminalStartResponse, error) {
	return h.terminals.Start(ctx, h.workspace.Path, req)
}

func (h WorkspaceHandle) GitStatus(ctx context.Context) (GitStatusResponse, error) {
	return h.gits.Status(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitListChanges(ctx context.Context) (GitChangesBySection, error) {
	return h.gits.ListChanges(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitTrackChanges(ctx context.Context, paths []string) error {
	return h.gits.TrackChanges(ctx, h.workspace.Path, paths)
}

func (h WorkspaceHandle) GitUnstageChanges(ctx context.Context, paths []string) error {
	return h.gits.UnstageChanges(ctx, h.workspace.Path, paths)
}

func (h WorkspaceHandle) GitRevertChanges(ctx context.Context, paths []string) error {
	return h.gits.RevertChanges(ctx, h.workspace.Path, paths)
}

func (h WorkspaceHandle) GitCommitChanges(ctx context.Context, message string, amend bool, signoff bool) (string, error) {
	return h.gits.CommitChanges(ctx, h.workspace.Path, message, amend, signoff)
}

func (h WorkspaceHandle) GitBranchStatus(ctx context.Context) (GitBranchStatus, error) {
	return h.gits.BranchStatus(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitBranchPullRequest(ctx context.Context, branch string) (GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequest(ctx, h.workspace.Path, branch)
}

func (h WorkspaceHandle) RefreshGitBranchPullRequest(ctx context.Context, branch string) (GitBranchPullRequestStatus, error) {
	return h.gits.RefreshBranchPullRequest(ctx, h.workspace.Path, branch)
}

func (h WorkspaceHandle) GitCurrentBranch(ctx context.Context) (string, error) {
	return h.gits.CurrentBranch(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitBranchPullRequestLite(ctx context.Context, branch string) (GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequestLite(ctx, h.workspace.Path, branch)
}

func (h WorkspaceHandle) GitBranchPullRequestWithDetails(ctx context.Context, branch string) (GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequestWithDetails(ctx, h.workspace.Path, branch)
}

func (h WorkspaceHandle) GitListCommitsToTarget(ctx context.Context, targetBranch string) (GitCommitComparison, error) {
	return h.gits.ListCommitsToTarget(ctx, h.workspace.Path, targetBranch)
}

func (h WorkspaceHandle) GitBranchDiffSummary(ctx context.Context, targetBranch string) (GitBranchDiffSummary, error) {
	return h.gits.BranchDiffSummary(ctx, h.workspace.Path, targetBranch)
}

func (h WorkspaceHandle) GitReadCommitDiff(ctx context.Context, commitHash string, path string) (GitDiffContent, error) {
	return h.gits.ReadCommitDiff(ctx, h.workspace.Path, commitHash, path)
}

func (h WorkspaceHandle) GitReadBranchComparisonDiff(ctx context.Context, targetBranch string, path string) (GitDiffContent, error) {
	return h.gits.ReadBranchComparisonDiff(ctx, h.workspace.Path, targetBranch, path)
}

func (h WorkspaceHandle) GitListBranches(ctx context.Context) (GitBranchList, error) {
	return h.gits.ListBranches(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitPushBranch(ctx context.Context) (string, error) {
	return h.gits.PushBranch(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitPublishBranch(ctx context.Context) (string, error) {
	return h.gits.PublishBranch(ctx, h.workspace.Path)
}

func (h WorkspaceHandle) GitRenameBranch(ctx context.Context, nextBranch string) error {
	return h.gits.RenameBranch(ctx, h.workspace.Path, nextBranch)
}

func (h WorkspaceHandle) GitRemoveBranch(ctx context.Context, branch string, force bool) error {
	return h.gits.RemoveBranch(ctx, h.workspace.Path, branch, force)
}

func (h WorkspaceHandle) GitPrMerge(ctx context.Context, prNumber int, method string, deleteBranch bool) (string, error) {
	return h.gits.MergePullRequest(ctx, h.workspace.Path, prNumber, method, deleteBranch)
}

func (h WorkspaceHandle) GitPrClose(ctx context.Context, prNumber int) (string, error) {
	return h.gits.ClosePullRequest(ctx, h.workspace.Path, prNumber)
}

func (h WorkspaceHandle) GitCreateWorktree(ctx context.Context, branch string, worktreePath string, createBranch bool, fromRef string) error {
	return h.gits.CreateWorktree(ctx, h.workspace.Path, branch, worktreePath, createBranch, fromRef)
}

func (h WorkspaceHandle) GitRemoveWorktree(ctx context.Context, worktreePath string, force bool) error {
	return h.gits.RemoveWorktree(ctx, h.workspace.Path, worktreePath, force)
}

func (h WorkspaceHandle) GitAuthorName(ctx context.Context) (string, error) {
	return h.gits.AuthorName(ctx, h.workspace.Path)
}
