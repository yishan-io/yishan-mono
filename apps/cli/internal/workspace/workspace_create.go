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

// contextLinkName is the directory name created inside each worktree
// pointing at the shared per-repo context folder.
const contextLinkName = ".my-context"

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

// defaultContextPath returns the per-repo shared context directory path.
// All workspaces for the same repo share this folder via a `context` symlink
// inside the worktree, so notes and references persist across worktrees.
func defaultContextPath(repoKey string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "contexts", repoKey), nil
}

// ensureContextLink creates the per-repo context directory (if missing) and
// links it from `<worktreePath>/.my-context`. It is idempotent: if the link is
// already correct, it is left in place; existing non-symlink entries at the
// link path are left untouched to avoid clobbering user data.
func ensureContextLink(contextPath string, worktreePath string) error {
	if err := os.MkdirAll(contextPath, 0o755); err != nil {
		return fmt.Errorf("ensure context dir: %w", err)
	}

	linkPath := filepath.Join(worktreePath, contextLinkName)
	info, err := os.Lstat(linkPath)
	if err == nil {
		// Path exists. Only manage it if it is a symlink we own.
		if info.Mode()&os.ModeSymlink == 0 {
			// Non-symlink (likely a real folder/file the user created); leave alone.
			return nil
		}
		existingTarget, readErr := os.Readlink(linkPath)
		if readErr == nil && existingTarget == contextPath {
			return nil
		}
		if removeErr := os.Remove(linkPath); removeErr != nil {
			return fmt.Errorf("remove stale context link: %w", removeErr)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("inspect context link: %w", err)
	}

	if err := os.Symlink(contextPath, linkPath); err != nil {
		return fmt.Errorf("create context symlink: %w", err)
	}
	return nil
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
