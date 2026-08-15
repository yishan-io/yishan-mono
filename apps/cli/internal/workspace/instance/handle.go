package instance

import (
	"context"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/terminal"
)

// Handle provides workspace-scoped capabilities (file, git, terminal
// operations) for one open workspace instance. The daemon builds handles from
// the instance registry plus the shared services.
type Handle struct {
	instance  workspace.Workspace
	files     *workspace.FileService
	gits      *workspace.GitService
	terminals *terminal.Manager
}

// NewHandle builds a handle for an instance with the shared services.
func NewHandle(inst workspace.Workspace, files *workspace.FileService, gits *workspace.GitService, terminals *terminal.Manager) Handle {
	return Handle{instance: inst, files: files, gits: gits, terminals: terminals}
}

// Instance returns the workspace record the handle is scoped to.
func (h Handle) Instance() workspace.Workspace {
	return h.instance
}

func (h Handle) FileList(path string, recursive bool) ([]workspace.FileEntry, error) {
	return h.files.List(h.instance.Path, path, recursive)
}

func (h Handle) FileSearch(query string, limit int, includeDirectories bool) ([]workspace.FileSearchResult, error) {
	return h.files.Search(h.instance.Path, query, limit, includeDirectories)
}

func (h Handle) FileStat(path string) (workspace.FileEntry, error) {
	return h.files.Stat(h.instance.Path, path)
}

func (h Handle) FileRead(path string) (string, error) {
	return h.files.Read(h.instance.Path, path)
}

func (h Handle) FileWrite(path string, content string, mode uint32) (int, error) {
	return h.files.Write(h.instance.Path, path, content, mode)
}

func (h Handle) FileDelete(path string, recursive bool) error {
	return h.files.Delete(h.instance.Path, path, recursive)
}

func (h Handle) FileMove(fromPath string, toPath string) error {
	return h.files.Move(h.instance.Path, fromPath, toPath)
}

func (h Handle) FileMkdir(path string, parents bool, mode uint32) error {
	return h.files.Mkdir(h.instance.Path, path, parents, mode)
}

func (h Handle) FileReadDiff(ctx context.Context, path string) (workspace.GitDiffContent, error) {
	return h.files.ReadDiff(ctx, h.instance.Path, path)
}

func (h Handle) TerminalStart(ctx context.Context, req workspace.TerminalStartRequest) (workspace.TerminalStartResponse, error) {
	if req.ProjectID == "" {
		req.ProjectID = h.instance.ProjectID
	}
	if req.OrgID == "" {
		req.OrgID = h.instance.OrgID
	}
	return h.terminals.Start(ctx, h.instance.Path, req)
}

func (h Handle) GitInspect(ctx context.Context) (workspace.GitInspectResult, error) {
	return h.gits.Inspect(ctx, h.instance.Path)
}

func (h Handle) GitStatus(ctx context.Context) (workspace.GitStatusResponse, error) {
	return h.gits.Status(ctx, h.instance.Path)
}

func (h Handle) GitListChanges(ctx context.Context) (workspace.GitChangesBySection, error) {
	return h.gits.ListChanges(ctx, h.instance.Path)
}

func (h Handle) GitTrackChanges(ctx context.Context, paths []string) error {
	return h.gits.TrackChanges(ctx, h.instance.Path, paths)
}

func (h Handle) GitUnstageChanges(ctx context.Context, paths []string) error {
	return h.gits.UnstageChanges(ctx, h.instance.Path, paths)
}

func (h Handle) GitRevertChanges(ctx context.Context, paths []string) error {
	return h.gits.RevertChanges(ctx, h.instance.Path, paths)
}

func (h Handle) GitCommitChanges(ctx context.Context, message string, amend bool, signoff bool) (string, error) {
	return h.gits.CommitChanges(ctx, h.instance.Path, message, amend, signoff)
}

func (h Handle) GitBranchStatus(ctx context.Context) (workspace.GitBranchStatus, error) {
	return h.gits.BranchStatus(ctx, h.instance.Path)
}

func (h Handle) GitBranchPullRequest(ctx context.Context, branch string) (workspace.GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequest(ctx, h.instance.Path, branch)
}

func (h Handle) RefreshGitBranchPullRequest(ctx context.Context, branch string) (workspace.GitBranchPullRequestStatus, error) {
	return h.gits.RefreshBranchPullRequest(ctx, h.instance.Path, branch)
}

func (h Handle) GitCurrentBranch(ctx context.Context) (string, error) {
	return h.gits.CurrentBranch(ctx, h.instance.Path)
}

func (h Handle) GitBranchPullRequestLite(ctx context.Context, branch string) (workspace.GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequestLite(ctx, h.instance.Path, branch)
}

func (h Handle) GitBranchPullRequestWithDetails(ctx context.Context, branch string) (workspace.GitBranchPullRequestStatus, error) {
	return h.gits.BranchPullRequestWithDetails(ctx, h.instance.Path, branch)
}

func (h Handle) GitListCommitsToTarget(ctx context.Context, targetBranch string) (workspace.GitCommitComparison, error) {
	return h.gits.ListCommitsToTarget(ctx, h.instance.Path, targetBranch)
}

func (h Handle) GitBranchDiffSummary(ctx context.Context, targetBranch string) (workspace.GitBranchDiffSummary, error) {
	return h.gits.BranchDiffSummary(ctx, h.instance.Path, targetBranch)
}

func (h Handle) GitReadCommitDiff(ctx context.Context, commitHash string, path string) (workspace.GitDiffContent, error) {
	return h.gits.ReadCommitDiff(ctx, h.instance.Path, commitHash, path)
}

func (h Handle) GitReadBranchComparisonDiff(ctx context.Context, targetBranch string, path string) (workspace.GitDiffContent, error) {
	return h.gits.ReadBranchComparisonDiff(ctx, h.instance.Path, targetBranch, path)
}

func (h Handle) GitListBranches(ctx context.Context) (workspace.GitBranchList, error) {
	return h.gits.ListBranches(ctx, h.instance.Path)
}

func (h Handle) GitPushBranch(ctx context.Context) (string, error) {
	return h.gits.PushBranch(ctx, h.instance.Path)
}

func (h Handle) GitPublishBranch(ctx context.Context) (string, error) {
	return h.gits.PublishBranch(ctx, h.instance.Path)
}

func (h Handle) GitRenameBranch(ctx context.Context, nextBranch string) error {
	return h.gits.RenameBranch(ctx, h.instance.Path, nextBranch)
}

func (h Handle) GitRemoveBranch(ctx context.Context, branch string, force bool) error {
	return h.gits.RemoveBranch(ctx, h.instance.Path, branch, force)
}

func (h Handle) GitPrMerge(ctx context.Context, prNumber int, method string, deleteBranch bool) (string, error) {
	return h.gits.MergePullRequest(ctx, h.instance.Path, prNumber, method, deleteBranch)
}

func (h Handle) GitPrClose(ctx context.Context, prNumber int) (string, error) {
	return h.gits.ClosePullRequest(ctx, h.instance.Path, prNumber)
}

func (h Handle) GitCreateWorktree(ctx context.Context, branch string, worktreePath string, createBranch bool, fromRef string) error {
	return h.gits.CreateWorktree(ctx, h.instance.Path, branch, worktreePath, createBranch, fromRef)
}

func (h Handle) GitRemoveWorktree(ctx context.Context, worktreePath string, force bool) error {
	return h.gits.RemoveWorktree(ctx, h.instance.Path, worktreePath, force)
}

func (h Handle) GitAuthorName(ctx context.Context) (string, error) {
	return h.gits.AuthorName(ctx, h.instance.Path)
}
