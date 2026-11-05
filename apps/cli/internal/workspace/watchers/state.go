package watchers

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"yishan/apps/cli/internal/workspace"
)

func nonRecursiveWatchPaths(entry *worktreeWatcher) []string {
	paths := []string{entry.resolvedGitDir}
	gitRefsDir := filepath.Join(entry.resolvedGitDir, "refs")
	if info, err := os.Stat(gitRefsDir); err == nil && info.IsDir() {
		paths = append(paths, gitRefsDir)
	}
	return paths
}

func (w *worktreeWatcher) hasWorktreeDirectory() bool {
	info, err := os.Stat(w.path)
	return err == nil && info.IsDir()
}

func (w *worktreeWatcher) handleChangedPath(changedPath string) {
	if !w.canNotify() || time.Now().Before(w.readyAt) {
		return
	}

	w.clearIgnoreCacheIfNeeded(changedPath)

	if w.isGitPath(changedPath) {
		if strings.HasSuffix(changedPath, ".lock") {
			return
		}
		w.scheduleGitEmit(w.isBranchRelevantGitPath(changedPath))
		return
	}

	if relPath, ok := w.contextRelativePath(changedPath); ok {
		w.scheduleFileEmit(relPath)
		return
	}

	if !w.shouldWatchWorkspaceDirWithoutGitIgnore(changedPath) {
		return
	}

	relPath := w.relativeWorkspacePath(changedPath)
	if w.shouldAlwaysWatchRelativePath(relPath) {
		w.scheduleFileEmit(relPath)
		return
	}
	w.enqueueOrdinaryPath(relPath)
}

func (w *worktreeWatcher) isGitPath(changedPath string) bool {
	gitEntry := filepath.Join(w.path, ".git")
	return strings.HasPrefix(changedPath, gitEntry) ||
		(w.resolvedGitDir != gitEntry && strings.HasPrefix(changedPath, w.resolvedGitDir))
}

func (w *worktreeWatcher) contextRelativePath(changedPath string) (string, bool) {
	if w.contextDir == "" {
		return "", false
	}
	if changedPath != w.contextDir && !strings.HasPrefix(changedPath, w.contextDir+string(filepath.Separator)) {
		return "", false
	}

	relPath, err := filepath.Rel(w.contextDir, changedPath)
	if err != nil {
		relPath = filepath.Base(changedPath)
	}
	if relPath == "." {
		relPath = ""
	}
	return filepath.ToSlash(filepath.Join(workspace.ContextLinkName, relPath)), true
}

func (w *worktreeWatcher) relativeWorkspacePath(changedPath string) string {
	relPath, err := filepath.Rel(w.path, changedPath)
	if err != nil {
		return filepath.ToSlash(changedPath)
	}
	if relPath == "." {
		return ""
	}
	return filepath.ToSlash(relPath)
}

func (w *worktreeWatcher) shouldWatchWorkspaceDir(path string) bool {
	if !w.shouldWatchWorkspaceDirWithoutGitIgnore(path) {
		return false
	}

	relPath := w.relativeWorkspacePath(path)
	if relPath == "" || w.shouldAlwaysWatchRelativePath(relPath) {
		return true
	}

	return !w.isGitIgnoredPath(relPath)
}

func (w *worktreeWatcher) shouldWatchWorkspaceDirWithoutGitIgnore(path string) bool {
	relPath, err := filepath.Rel(w.path, path)
	if err != nil {
		return false
	}
	if relPath == "." {
		return true
	}

	parts := strings.Split(filepath.Clean(relPath), string(filepath.Separator))
	for index, part := range parts {
		if part == workspace.ContextLinkName {
			return true
		}
		switch part {
		case ".git":
			if index == 0 {
				return false
			}
		case "node_modules", "dist", "build":
			return false
		case "objects":
			if index > 0 && parts[index-1] == ".git" {
				return false
			}
		}
	}

	return true
}

func (w *worktreeWatcher) clearIgnoreCacheIfNeeded(changedPath string) {
	if !w.isGitIgnoreConfigPath(changedPath) {
		return
	}

	w.mu.Lock()
	if w.isClosed {
		w.mu.Unlock()
		return
	}
	w.ignoreGeneration++
	w.ignoredPaths = make(map[string]bool)
	w.gitIgnoreUsable = nil
	w.mu.Unlock()
}

func (w *worktreeWatcher) isGitIgnoreConfigPath(changedPath string) bool {
	base := filepath.Base(changedPath)
	if base == ".gitignore" || base == ".git" {
		return true
	}

	relPath := w.relativeWorkspacePath(changedPath)
	return relPath == gitInfoExcludeRel
}

func (w *worktreeWatcher) shouldAlwaysWatchRelativePath(relativePath string) bool {
	for part := range strings.SplitSeq(relativePath, "/") {
		if part == workspace.ContextLinkName {
			return true
		}
	}

	return false
}

func (w *worktreeWatcher) isBranchRelevantGitPath(changedPath string) bool {
	gitDir := w.resolvedGitDir
	if changedPath == filepath.Join(gitDir, "HEAD") {
		return true
	}
	if changedPath == filepath.Join(gitDir, "packed-refs") {
		return true
	}
	refsHeads := filepath.Join(gitDir, "refs", "heads")
	return changedPath == refsHeads ||
		strings.HasPrefix(changedPath, refsHeads+string(filepath.Separator))
}
