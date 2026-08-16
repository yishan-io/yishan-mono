package worktree

import (
	"os"
	"path/filepath"
	"strings"
)

// DefaultRepoPath returns the local path of the shared clone for a repo key.
func DefaultRepoPath(repoKey string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "repos", repoKey), nil
}

// DefaultWorktreePath returns the local path for a worktree of a repo key and
// workspace name (branch-like names are sanitized by ResolveCreatePaths).
func DefaultWorktreePath(repoKey string, workspaceName string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "worktrees", repoKey, workspaceName), nil
}

// AbsUserPath resolves a user path (~ expansion) to an absolute path.
func AbsUserPath(path string) (string, error) {
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

// SafeRelativePath validates a relative path stays inside .yishan.
func SafeRelativePath(input string, field string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" || filepath.IsAbs(trimmed) {
		return "", NewError(ErrCodeInvalidParams, field+" must be relative")
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", NewError(ErrCodeInvalidParams, field+" must not escape .yishan")
	}
	return cleaned, nil
}
