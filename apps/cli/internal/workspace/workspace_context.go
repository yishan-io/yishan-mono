package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// contextLinkName is the directory name created inside each worktree pointing
// at the shared per-repo context folder.
const contextLinkName = ".my-context"

// SyncContextLinkRequest applies the project-level `contextEnabled` flag to a
// set of existing workspace worktree paths. When enabled, the per-repo context
// folder is ensured and a `.my-context` symlink is created in each worktree.
// When disabled, only symlinks pointing at this repo's context folder are
// removed; user-created folders and unrelated symlinks are left alone.
type SyncContextLinkRequest struct {
	RepoKey       string   `json:"repoKey"`
	Enabled       bool     `json:"enabled"`
	WorktreePaths []string `json:"worktreePaths"`
}

// SyncContextLinkResult reports per-path outcomes so the caller can surface
// any non-fatal failures without aborting the whole batch.
type SyncContextLinkResult struct {
	Updated []string          `json:"updated"`
	Skipped []string          `json:"skipped"`
	Errors  map[string]string `json:"errors"`
}

// SyncContextLink walks the provided worktree paths and aligns each one with
// the requested context state. Failures on individual paths are recorded in
// the result rather than aborting, which matches the UI semantics: the user
// flipped a single toggle and expects best-effort propagation.
func (m *Manager) SyncContextLink(req SyncContextLinkRequest) (SyncContextLinkResult, error) {
	repoKey, err := safeRelativePath(req.RepoKey, "repoKey")
	if err != nil {
		return SyncContextLinkResult{}, err
	}

	contextPath, err := defaultContextPath(repoKey)
	if err != nil {
		return SyncContextLinkResult{}, err
	}

	result := SyncContextLinkResult{
		Updated: make([]string, 0, len(req.WorktreePaths)),
		Skipped: make([]string, 0),
		Errors:  make(map[string]string),
	}

	seen := make(map[string]struct{}, len(req.WorktreePaths))
	for _, raw := range req.WorktreePaths {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			result.Skipped = append(result.Skipped, raw)
			continue
		}
		// Require an absolute or `~`-rooted path so a malformed caller cannot
		// trick the daemon into operating on its current working directory.
		if !filepath.IsAbs(trimmed) && trimmed != "~" && !strings.HasPrefix(trimmed, "~/") {
			result.Errors[raw] = "worktree path must be absolute"
			continue
		}
		path, err := absUserPath(trimmed)
		if err != nil {
			result.Errors[raw] = fmt.Sprintf("invalid worktree path: %v", err)
			continue
		}
		if _, dup := seen[path]; dup {
			continue
		}
		seen[path] = struct{}{}

		var opErr error
		if req.Enabled {
			opErr = ensureContextLink(contextPath, path)
		} else {
			opErr = removeContextLink(contextPath, path)
		}
		if opErr != nil {
			result.Errors[path] = opErr.Error()
			continue
		}
		result.Updated = append(result.Updated, path)
	}

	return result, nil
}

// defaultContextPath returns the per-repo shared context directory path.
// All workspaces for the same repo share this folder via a `.my-context`
// symlink inside the worktree, so notes and references persist across
// worktrees.
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
		// On Windows, os.Symlink requires either Developer Mode or
		// SeCreateSymbolicLinkPrivilege. Surface a hint so the user knows the
		// fix is in their OS settings rather than in Yishan.
		if runtime.GOOS == "windows" {
			return fmt.Errorf(
				"create context symlink: %w (on Windows, enable Developer Mode or grant SeCreateSymbolicLinkPrivilege)",
				err,
			)
		}
		return fmt.Errorf("create context symlink: %w", err)
	}
	return nil
}

// removeContextLink removes `<worktreePath>/.my-context` only if it is a
// symlink pointing at `contextPath`. Non-symlink entries and symlinks with
// other targets are left untouched to avoid clobbering user data. Returns nil
// when there is nothing to remove.
func removeContextLink(contextPath string, worktreePath string) error {
	linkPath := filepath.Join(worktreePath, contextLinkName)
	info, err := os.Lstat(linkPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("inspect context link: %w", err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		// User-created folder/file; leave alone.
		return nil
	}
	existingTarget, readErr := os.Readlink(linkPath)
	if readErr != nil {
		return fmt.Errorf("read context link: %w", readErr)
	}
	if existingTarget != contextPath {
		// Symlink points somewhere else; the user or another tool owns it.
		return nil
	}
	if err := os.Remove(linkPath); err != nil {
		return fmt.Errorf("remove context link: %w", err)
	}
	return nil
}
