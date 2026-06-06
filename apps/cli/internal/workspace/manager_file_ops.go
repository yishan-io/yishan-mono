package workspace

import "context"

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
