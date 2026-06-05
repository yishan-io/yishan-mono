package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"yishan/apps/cli/internal/workspace/terminal"
)

type Workspace struct {
	ID              string                `json:"id"`
	Path            string                `json:"path"`
	OrgID           string                `json:"orgId,omitempty"`
	ProjectID       string                `json:"projectId,omitempty"`
	SetupHookResult *HookResult           `json:"setupHookResult,omitempty"`
	PullRequest     *WorkspacePullRequest `json:"pullRequest,omitempty"`
}

type WorkspacePullRequest struct {
	Number         int                        `json:"number"`
	Title          string                     `json:"title,omitempty"`
	URL            string                     `json:"url,omitempty"`
	Branch         string                     `json:"branch,omitempty"`
	BaseBranch     string                     `json:"baseBranch,omitempty"`
	GitHubState    string                     `json:"githubState,omitempty"`
	Status         string                     `json:"status,omitempty"`
	ReviewDecision string                     `json:"reviewDecision,omitempty"`
	IsDraft        bool                       `json:"isDraft,omitempty"`
	Complete       bool                       `json:"complete,omitempty"`
	UpdatedAt      string                     `json:"updatedAt,omitempty"`
	Checks         []GitPullRequestCheck      `json:"checks,omitempty"`
	Deployments    []GitPullRequestDeployment `json:"deployments,omitempty"`
}

type Manager struct {
	mu         sync.RWMutex
	workspaces map[string]Workspace
	files      *FileService
	gits       *GitService
	terminals  *terminal.Manager
}

func NewManager() *Manager {
	return &Manager{
		workspaces: make(map[string]Workspace),
		files:      NewFileService(),
		gits:       NewGitService(),
		terminals:  terminal.NewManager(),
	}
}

type OpenRequest struct {
	ID              string `json:"id"`
	Path            string `json:"path"`
	OrgID           string `json:"orgId,omitempty"`
	ProjectID       string `json:"projectId,omitempty"`
	PRAlreadyMerged bool   `json:"prAlreadyMerged,omitempty"`
}

type CloseRequest struct {
	WorkspaceID   string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

type ClosePathRequest struct {
	WorkspaceID   string
	Path          string
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
	PostHook      string
}

func (m *Manager) Open(req OpenRequest) (Workspace, error) {
	if req.ID == "" || req.Path == "" {
		return Workspace{}, NewRPCError(rpcCodeInvalidParams, "id and path are required")
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		return Workspace{}, err
	}
	resolvedPath, err := filepath.EvalSymlinks(absPath)
	if err == nil {
		absPath = resolvedPath
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return Workspace{}, err
	}
	if !info.IsDir() {
		return Workspace{}, NewRPCError(rpcCodeInvalidParams, "workspace path must be a directory")
	}

	ws := Workspace{ID: req.ID, Path: absPath, OrgID: req.OrgID, ProjectID: req.ProjectID}

	ensureGitExclude(absPath, ContextLinkName)

	m.mu.Lock()
	m.workspaces[req.ID] = ws
	m.mu.Unlock()

	return ws, nil
}

func (m *Manager) List() []Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]Workspace, 0, len(m.workspaces))
	for _, ws := range m.workspaces {
		out = append(out, ws)
	}
	return out
}

// CloseResult captures the outcome of a workspace close operation, including
// any post-hook execution result.
type CloseResult struct {
	PostHookResult        *HookResult `json:"postHookResult,omitempty"`
	TerminalCleanupErrors []string    `json:"terminalCleanupErrors,omitempty"`
}

func (m *Manager) CloseWorkspace(ctx context.Context, req CloseRequest) (CloseResult, error) {
	ws, err := m.getWorkspace(req.WorkspaceID)
	if err != nil {
		return CloseResult{}, err
	}

	var result CloseResult

	cleanupErrors := m.terminals.StopAllForWorkspace(req.WorkspaceID)
	if len(cleanupErrors) > 0 {
		messages := make([]string, len(cleanupErrors))
		for i, e := range cleanupErrors {
			messages[i] = e.Error()
		}
		result.TerminalCleanupErrors = messages
	}

	result, err = m.CloseWorkspacePath(ctx, ClosePathRequest{
		WorkspaceID:   req.WorkspaceID,
		Path:          ws.Path,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	})
	if err != nil {
		return result, err
	}

	m.mu.Lock()
	delete(m.workspaces, req.WorkspaceID)
	m.mu.Unlock()

	return result, nil
}

func (m *Manager) CloseWorkspacePath(ctx context.Context, req ClosePathRequest) (CloseResult, error) {
	var result CloseResult

	if _, statErr := os.Stat(req.Path); statErr != nil {
		if os.IsNotExist(statErr) {
			return result, nil
		}
		return result, statErr
	}

	// Run the post hook before tearing down the workspace so the hook can
	// still access workspace files and git state. Hook failures are
	// non-fatal: the close operation always proceeds.
	hookResult, hookErr := RunHook(ctx, HookRequest{
		Command:       req.PostHook,
		WorkspaceID:   req.WorkspaceID,
		WorkspacePath: req.Path,
		HookName:      "post",
	})
	if hookErr != nil {
		hookResult.Error = fmt.Sprintf("post hook: %v", hookErr)
		result.PostHookResult = &hookResult
	} else if !hookResult.Skipped {
		result.PostHookResult = &hookResult
	}

	mainWorktreePath, err := m.gits.MainWorktreePath(ctx, req.Path)
	if err != nil {
		return result, err
	}

	branch := req.Branch
	if req.RemoveBranch && branch == "" {
		branch, err = m.gits.CurrentBranch(ctx, req.Path)
		if err != nil {
			return result, err
		}
	}

	if err := m.gits.RemoveWorktree(ctx, mainWorktreePath, req.Path, req.ForceWorktree); err != nil {
		return result, err
	}
	if req.RemoveBranch {
		if err := m.gits.RemoveBranch(ctx, mainWorktreePath, branch, req.ForceBranch); err != nil {
			return result, err
		}
	}

	return result, nil
}

func (m *Manager) getWorkspace(id string) (Workspace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ws, ok := m.workspaces[id]
	if !ok {
		return Workspace{}, NewRPCError(rpcCodeNotFound, "workspace not found")
	}
	return ws, nil
}

func (m *Manager) GetWorkspace(id string) (Workspace, error) {
	return m.getWorkspace(id)
}

func (m *Manager) WorkspaceHandle(id string) (WorkspaceHandle, error) {
	ws, err := m.getWorkspace(id)
	if err != nil {
		return WorkspaceHandle{}, err
	}
	return m.handleForWorkspace(ws), nil
}

func (m *Manager) WorkspaceHandleByPath(path string) (WorkspaceHandle, error) {
	resolvedPath, err := filepath.Abs(path)
	if err != nil {
		return WorkspaceHandle{}, err
	}
	canonicalPath, err := filepath.EvalSymlinks(resolvedPath)
	if err == nil {
		resolvedPath = canonicalPath
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, ws := range m.workspaces {
		if ws.Path == resolvedPath {
			return m.handleForWorkspace(ws), nil
		}
	}
	return WorkspaceHandle{}, NewRPCError(rpcCodeNotFound, "workspace not found")
}

func (m *Manager) handleForWorkspace(ws Workspace) WorkspaceHandle {
	return WorkspaceHandle{workspace: ws, files: m.files, gits: m.gits, terminals: m.terminals}
}

func (m *Manager) FindWorkspaceByPath(path string) (Workspace, bool) {
	handle, err := m.WorkspaceHandleByPath(path)
	if err != nil {
		return Workspace{}, false
	}
	return handle.Workspace(), true
}

func (m *Manager) SetWorkspacePullRequest(workspaceID string, pr *WorkspacePullRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	ws, ok := m.workspaces[workspaceID]
	if !ok {
		return NewRPCError(rpcCodeNotFound, "workspace not found")
	}

	ws.PullRequest = pr
	m.workspaces[workspaceID] = ws
	return nil
}

func (m *Manager) TerminalStart(ctx context.Context, req TerminalStartRequest) (TerminalStartResponse, error) {
	handle, err := m.WorkspaceHandle(req.WorkspaceID)
	if err != nil {
		return TerminalStartResponse{}, err
	}
	return handle.TerminalStart(ctx, req)
}

func (m *Manager) FileList(workspaceID string, path string, recursive bool) ([]FileEntry, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileList(path, recursive)
}

func (m *Manager) FileSearch(workspaceID string, query string, limit int) ([]FileSearchResult, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return nil, err
	}
	return handle.FileSearch(query, limit)
}

func (m *Manager) FileStat(workspaceID string, path string) (FileEntry, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return FileEntry{}, err
	}
	return handle.FileStat(path)
}

func (m *Manager) FileRead(workspaceID string, path string) (string, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return "", err
	}
	return handle.FileRead(path)
}

func (m *Manager) FileWrite(workspaceID string, path string, content string, mode uint32) (int, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return 0, err
	}
	return handle.FileWrite(path, content, mode)
}

func (m *Manager) FileDelete(workspaceID string, path string, recursive bool) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.FileDelete(path, recursive)
}

func (m *Manager) FileMove(workspaceID string, fromPath string, toPath string) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.FileMove(fromPath, toPath)
}

func (m *Manager) FileMkdir(workspaceID string, path string, parents bool, mode uint32) error {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return err
	}
	return handle.FileMkdir(path, parents, mode)
}

func (m *Manager) FileReadDiff(ctx context.Context, workspaceID string, path string) (GitDiffContent, error) {
	handle, err := m.WorkspaceHandle(workspaceID)
	if err != nil {
		return GitDiffContent{}, err
	}
	return handle.FileReadDiff(ctx, path)
}

func (m *Manager) InvalidateWorkspaceFileCacheByPath(worktreePath string, changedPaths []string) {
	m.files.InvalidateWorkspacePaths(worktreePath, changedPaths)
}

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
