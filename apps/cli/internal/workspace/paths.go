package workspace

import (
	"os"
	"path/filepath"
)

// DefaultContextPath returns the per-repo context directory shared by all
// worktrees of a repo (context links stay a workspace-layer concern; worktree
// path resolution lives in internal/worktree).
func DefaultContextPath(repoKey string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "contexts", repoKey), nil
}
