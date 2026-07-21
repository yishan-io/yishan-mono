package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"yishan/apps/cli/internal/workspace/terminal"
)

const (
	WorkspaceStateActive     = "active"
	WorkspaceStateDegraded   = "degraded"
	WorkspaceStateClosing    = "closing"
	WorkspaceStateOrphaned   = "orphaned"
	WorkspaceStateStaleIndex = "stale_index"

	WorkspaceHealthPathMissing = "path-missing"
	WorkspaceHealthNotWorktree = "not-worktree"
)

type Workspace struct {
	ID              string                `json:"id"`
	Path            string                `json:"path"`
	OrgID           string                `json:"orgId,omitempty"`
	ProjectID       string                `json:"projectId,omitempty"`
	State           string                `json:"state"`
	Health          string                `json:"health,omitempty"`
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

type RefreshPullRequestRequest struct {
	WorkspaceID string `json:"workspaceId,omitempty"`
	Path        string `json:"path,omitempty"`
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

	ensureGitExclude(absPath, ContextLinkName)

	m.mu.Lock()
	var existing Workspace
	if current, ok := m.workspaces[req.ID]; ok {
		existing = current
	}
	existingPathID := ""
	for workspaceID, workspace := range m.workspaces {
		if workspace.Path != absPath {
			continue
		}
		existingPathID = workspaceID
		if existing.ID == "" {
			existing = workspace
		}
		break
	}

	ws := Workspace{
		ID:              req.ID,
		Path:            absPath,
		OrgID:           req.OrgID,
		ProjectID:       req.ProjectID,
		State:           WorkspaceStateActive,
		SetupHookResult: existing.SetupHookResult,
		PullRequest:     existing.PullRequest,
	}
	if ws.OrgID == "" {
		ws.OrgID = existing.OrgID
	}
	if ws.ProjectID == "" {
		ws.ProjectID = existing.ProjectID
	}
	if existingPathID != "" && existingPathID != req.ID {
		delete(m.workspaces, existingPathID)
	}
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

func (m *Manager) SetWorkspaceState(workspaceID string, state string, health string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	ws, ok := m.workspaces[workspaceID]
	if !ok {
		return NewRPCError(rpcCodeNotFound, "workspace not found")
	}

	ws.State = state
	ws.Health = health
	m.workspaces[workspaceID] = ws
	return nil
}

func (m *Manager) InvalidateWorkspaceFileCacheByPath(worktreePath string, changedPaths []string) {
	m.files.InvalidateWorkspacePaths(worktreePath, changedPaths)
}

func (m *Manager) RemoveWorkspaceFromMemory(workspaceID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.workspaces, workspaceID)
}

func (m *Manager) GitInspect(ctx context.Context, path string) (GitInspectResult, error) {
	return m.gits.Inspect(ctx, path)
}

func (m *Manager) SyncRepoSource(ctx context.Context, repoPath string) error {
	return updateGitRepo(ctx, repoPath)
}

func (m *Manager) Terminals() *terminal.Manager {
	return m.terminals
}
