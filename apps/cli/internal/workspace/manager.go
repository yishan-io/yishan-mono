package workspace

import (
	"context"
	"os"
	"path/filepath"
	"sync"
)

type Workspace struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

type Manager struct {
	mu         sync.RWMutex
	workspaces map[string]Workspace
	files      *FileService
	gits       *GitService
	terminals  *TerminalManager
}

func NewManager() *Manager {
	return &Manager{
		workspaces: make(map[string]Workspace),
		files:      NewFileService(),
		gits:       NewGitService(),
		terminals:  NewTerminalManager(),
	}
}

type OpenRequest struct {
	ID   string `json:"id"`
	Path string `json:"path"`
}

func (m *Manager) Open(req OpenRequest) (Workspace, error) {
	if req.ID == "" || req.Path == "" {
		return Workspace{}, NewRPCError(-32602, "id and path are required")
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		return Workspace{}, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return Workspace{}, err
	}
	if !info.IsDir() {
		return Workspace{}, NewRPCError(-32602, "workspace path must be a directory")
	}

	ws := Workspace{ID: req.ID, Path: absPath}

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

func (m *Manager) getWorkspace(id string) (Workspace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ws, ok := m.workspaces[id]
	if !ok {
		return Workspace{}, NewRPCError(-32004, "workspace not found")
	}
	return ws, nil
}

func (m *Manager) TerminalStart(ctx context.Context, req TerminalStartRequest) (TerminalStartResponse, error) {
	ws, err := m.getWorkspace(req.WorkspaceID)
	if err != nil {
		return TerminalStartResponse{}, err
	}
	return m.terminals.Start(ctx, ws.Path, req)
}

func (m *Manager) FileList(workspaceID string, path string) ([]FileEntry, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	return m.files.List(ws.Path, path)
}

func (m *Manager) FileStat(workspaceID string, path string) (FileEntry, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return FileEntry{}, err
	}
	return m.files.Stat(ws.Path, path)
}

func (m *Manager) FileRead(workspaceID string, path string) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.files.Read(ws.Path, path)
}

func (m *Manager) FileWrite(workspaceID string, path string, content string, mode uint32) (int, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return 0, err
	}
	return m.files.Write(ws.Path, path, content, mode)
}

func (m *Manager) FileDelete(workspaceID string, path string, recursive bool) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.files.Delete(ws.Path, path, recursive)
}

func (m *Manager) FileMove(workspaceID string, fromPath string, toPath string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.files.Move(ws.Path, fromPath, toPath)
}

func (m *Manager) FileMkdir(workspaceID string, path string, parents bool, mode uint32) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.files.Mkdir(ws.Path, path, parents, mode)
}

func (m *Manager) FileReadDiff(ctx context.Context, workspaceID string, path string) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.files.ReadDiff(ctx, ws.Path, path)
}

func (m *Manager) GitStatus(ctx context.Context, workspaceID string) (GitStatusResponse, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitStatusResponse{}, err
	}
	return m.gits.Status(ctx, ws.Path)
}

func (m *Manager) GitInspect(ctx context.Context, path string) (GitInspectResult, error) {
	return m.gits.Inspect(ctx, path)
}

func (m *Manager) GitListChanges(ctx context.Context, workspaceID string) (GitChangesBySection, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitChangesBySection{}, err
	}
	return m.gits.ListChanges(ctx, ws.Path)
}

func (m *Manager) GitTrackChanges(ctx context.Context, workspaceID string, paths []string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.TrackChanges(ctx, ws.Path, paths)
}

func (m *Manager) GitUnstageChanges(ctx context.Context, workspaceID string, paths []string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.UnstageChanges(ctx, ws.Path, paths)
}

func (m *Manager) GitRevertChanges(ctx context.Context, workspaceID string, paths []string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.RevertChanges(ctx, ws.Path, paths)
}

func (m *Manager) GitCommitChanges(ctx context.Context, workspaceID string, message string, amend bool, signoff bool) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.gits.CommitChanges(ctx, ws.Path, message, amend, signoff)
}

func (m *Manager) GitBranchStatus(ctx context.Context, workspaceID string) (GitBranchStatus, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitBranchStatus{}, err
	}
	return m.gits.BranchStatus(ctx, ws.Path)
}

func (m *Manager) GitListCommitsToTarget(ctx context.Context, workspaceID string, targetBranch string) (GitCommitComparison, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitCommitComparison{}, err
	}
	return m.gits.ListCommitsToTarget(ctx, ws.Path, targetBranch)
}

func (m *Manager) GitReadCommitDiff(ctx context.Context, workspaceID string, commitHash string, path string) (GitDiffContent, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitDiffContent{}, err
	}
	return m.gits.ReadCommitDiff(ctx, ws.Path, commitHash, path)
}

func (m *Manager) GitReadBranchComparisonDiff(ctx context.Context, workspaceID string, targetBranch string, path string) (GitDiffContent, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitDiffContent{}, err
	}
	return m.gits.ReadBranchComparisonDiff(ctx, ws.Path, targetBranch, path)
}

func (m *Manager) GitListBranches(ctx context.Context, workspaceID string) (GitBranchList, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return GitBranchList{}, err
	}
	return m.gits.ListBranches(ctx, ws.Path)
}

func (m *Manager) GitPushBranch(ctx context.Context, workspaceID string) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.gits.PushBranch(ctx, ws.Path)
}

func (m *Manager) GitPublishBranch(ctx context.Context, workspaceID string) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.gits.PublishBranch(ctx, ws.Path)
}

func (m *Manager) GitRenameBranch(ctx context.Context, workspaceID string, nextBranch string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.RenameBranch(ctx, ws.Path, nextBranch)
}

func (m *Manager) GitRemoveBranch(ctx context.Context, workspaceID string, branch string, force bool) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.RemoveBranch(ctx, ws.Path, branch, force)
}

func (m *Manager) GitCreateWorktree(ctx context.Context, workspaceID string, branch string, worktreePath string, createBranch bool, fromRef string) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.CreateWorktree(ctx, ws.Path, branch, worktreePath, createBranch, fromRef)
}

func (m *Manager) GitRemoveWorktree(ctx context.Context, workspaceID string, worktreePath string, force bool) error {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return err
	}
	return m.gits.RemoveWorktree(ctx, ws.Path, worktreePath, force)
}

func (m *Manager) GitAuthorName(ctx context.Context, workspaceID string) (string, error) {
	ws, err := m.getWorkspace(workspaceID)
	if err != nil {
		return "", err
	}
	return m.gits.AuthorName(ctx, ws.Path)
}

func (m *Manager) TerminalSend(req TerminalSendRequest) (TerminalSendResponse, error) {
	return m.terminals.Send(req)
}

func (m *Manager) TerminalRead(req TerminalReadRequest) (TerminalReadResponse, error) {
	return m.terminals.Read(req)
}

func (m *Manager) TerminalStop(req TerminalStopRequest) (TerminalStopResponse, error) {
	return m.terminals.Stop(req)
}

func (m *Manager) TerminalResize(req TerminalResizeRequest) (TerminalResizeResponse, error) {
	return m.terminals.Resize(req)
}

func (m *Manager) TerminalSubscribe(req TerminalSubscribeRequest) (TerminalSubscription, error) {
	return m.terminals.Subscribe(req)
}

func (m *Manager) TerminalUnsubscribe(req TerminalUnsubscribeRequest) (TerminalUnsubscribeResponse, error) {
	return m.terminals.Unsubscribe(req)
}
