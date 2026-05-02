package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type CreateRequest struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	RepoKey        string `json:"repoKey"`
	WorkspaceName  string `json:"workspaceName"`
	SourcePath     string `json:"sourcePath"`
	TargetBranch   string `json:"targetBranch"`
	SourceBranch   string `json:"sourceBranch"`
	ContextEnabled bool   `json:"contextEnabled,omitempty"`
}

func (m *Manager) CreateWorkspace(ctx context.Context, req CreateRequest) (Workspace, error) {
	if strings.TrimSpace(req.ID) == "" {
		return Workspace{}, NewRPCError(-32602, "id is required")
	}
	if strings.TrimSpace(req.SourcePath) == "" {
		return Workspace{}, NewRPCError(-32602, "sourcePath is required")
	}
	if strings.TrimSpace(req.RepoKey) == "" {
		return Workspace{}, NewRPCError(-32602, "repoKey is required")
	}
	if strings.TrimSpace(req.WorkspaceName) == "" {
		return Workspace{}, NewRPCError(-32602, "workspaceName is required")
	}
	if strings.TrimSpace(req.TargetBranch) == "" {
		return Workspace{}, NewRPCError(-32602, "targetBranch is required")
	}
	if strings.TrimSpace(req.SourceBranch) == "" {
		return Workspace{}, NewRPCError(-32602, "sourceBranch is required")
	}

	sourcePath, err := absUserPath(req.SourcePath)
	if err != nil {
		return Workspace{}, err
	}
	repoKey, err := safeRelativePath(req.RepoKey, "repoKey")
	if err != nil {
		return Workspace{}, err
	}
	workspaceName, err := safeRelativePath(req.WorkspaceName, "workspaceName")
	if err != nil {
		return Workspace{}, err
	}
	worktreePath, err := defaultWorktreePath(repoKey, workspaceName)
	if err != nil {
		return Workspace{}, err
	}

	if err := m.gits.CreateWorktree(ctx, sourcePath, req.TargetBranch, worktreePath, true, strings.TrimSpace(req.SourceBranch)); err != nil {
		return Workspace{}, err
	}

	if req.ContextEnabled {
		contextPath, err := defaultContextPath(repoKey)
		if err != nil {
			return Workspace{}, err
		}
		if err := ensureContextLink(contextPath, worktreePath); err != nil {
			return Workspace{}, fmt.Errorf("create context link: %w", err)
		}
	}

	ws := Workspace{ID: strings.TrimSpace(req.ID), Path: worktreePath}
	m.mu.Lock()
	m.workspaces[ws.ID] = ws
	m.mu.Unlock()

	return ws, nil
}

func absUserPath(path string) (string, error) {
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, path[2:])
		}
	}
	return filepath.Abs(path)
}

func defaultWorktreePath(repoKey string, workspaceName string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "worktrees", repoKey, workspaceName), nil
}

func safeRelativePath(input string, field string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || filepath.IsAbs(trimmed) {
		return "", NewRPCError(-32602, field+" must be relative")
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", NewRPCError(-32602, field+" must not escape .yishan")
	}
	return cleaned, nil
}
