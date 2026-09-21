package workspace

import (
	"path/filepath"
)

// DefaultContextPath returns the per-repo context directory shared by all
// worktrees of a repo (context links stay a workspace-layer concern; worktree
// path resolution lives in internal/worktree).
func DefaultContextPath(repoKey string) (string, error) {
	basePath, err := contextBasePath()
	if err != nil {
		return "", err
	}
	return filepath.Join(basePath, repoKey), nil
}
