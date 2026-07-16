package daemon

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
)

// resolveGitDir returns the actual git directory for a worktree path.
// For standard repositories, .git is a directory and is returned directly.
// For git worktrees, .git is a file containing "gitdir: <path>" pointing to
// the real git directory (e.g., /repo/.git/worktrees/<name>).
func resolveGitDir(worktreePath string) string {
	gitEntry := filepath.Join(worktreePath, ".git")
	info, err := os.Lstat(gitEntry)
	if err != nil {
		return gitEntry
	}

	if info.IsDir() {
		return gitEntry
	}

	content, err := os.ReadFile(gitEntry)
	if err != nil {
		return gitEntry
	}

	line := strings.TrimSpace(string(content))
	gitDirPath, ok := strings.CutPrefix(line, "gitdir: ")
	if !ok {
		return gitEntry
	}

	if !filepath.IsAbs(gitDirPath) {
		gitDirPath = filepath.Join(worktreePath, gitDirPath)
	}

	resolved := filepath.Clean(gitDirPath)
	if _, err := os.Stat(resolved); err != nil {
		return gitEntry
	}

	return resolved
}

func nonRecursiveWatchPaths(entry *worktreeWatcher) []string {
	paths := []string{entry.resolvedGitDir}
	gitRefsDir := filepath.Join(entry.resolvedGitDir, "refs")
	if info, err := os.Stat(gitRefsDir); err == nil && info.IsDir() {
		paths = append(paths, gitRefsDir)
	}
	return paths
}

func (w *worktreeWatcher) handleChangedPath(changedPath string) {
	if time.Now().Before(w.readyAt) {
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

	if !w.shouldEmitWorkspacePath(changedPath) {
		return
	}

	w.scheduleFileEmit(w.relativeWorkspacePath(changedPath))
}

func (w *worktreeWatcher) shouldEmitWorkspacePath(changedPath string) bool {
	relPath := w.relativeWorkspacePath(changedPath)
	if relPath == "" {
		return true
	}
	if w.isGitRelativePath(relPath) {
		return false
	}

	absPath := filepath.Join(w.path, filepath.FromSlash(relPath))
	if !w.shouldWatchWorkspaceDirWithoutGitIgnore(absPath) {
		return false
	}
	if w.shouldAlwaysWatchRelativePath(relPath) {
		return true
	}
	return !w.isGitIgnoredPath(relPath)
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

func (w *worktreeWatcher) isGitIgnoredPath(path string) bool {
	if !w.isGitIgnoreUsable() {
		return false
	}

	relPath := path
	if filepath.IsAbs(path) {
		relPath = w.relativeWorkspacePath(path)
	}
	if relPath == "" {
		return false
	}

	w.mu.Lock()
	if ignored, ok := w.ignoredPaths[relPath]; ok {
		w.mu.Unlock()
		return ignored
	}
	if w.hasCachedIgnoredAncestor(relPath) {
		w.ignoredPaths[relPath] = true
		w.mu.Unlock()
		return true
	}
	w.mu.Unlock()

	ignored := w.gitCheckIgnore(relPath)

	w.mu.Lock()
	w.ignoredPaths[relPath] = ignored
	w.mu.Unlock()
	return ignored
}

func (w *worktreeWatcher) hasCachedIgnoredAncestor(relativePath string) bool {
	parentPath := relativePath
	for {
		separatorIndex := strings.LastIndex(parentPath, "/")
		if separatorIndex <= 0 {
			return false
		}
		parentPath = parentPath[:separatorIndex]
		if w.ignoredPaths[parentPath] {
			return true
		}
	}
}

func (w *worktreeWatcher) isGitIgnoreUsable() bool {
	w.mu.Lock()
	if w.gitIgnoreUsable != nil {
		usable := *w.gitIgnoreUsable
		w.mu.Unlock()
		return usable
	}
	w.mu.Unlock()

	usable := w.gitWorktreeReady()

	w.mu.Lock()
	w.gitIgnoreUsable = &usable
	w.mu.Unlock()
	return usable
}

func (w *worktreeWatcher) clearIgnoreCacheIfNeeded(changedPath string) {
	if !w.isGitIgnoreConfigPath(changedPath) {
		return
	}

	w.mu.Lock()
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

func (w *worktreeWatcher) gitCheckIgnore(relativePath string) bool {
	if strings.TrimSpace(relativePath) == "" {
		return false
	}

	command, ok := w.gitCommand("-C", w.path, "check-ignore", "-q", relativePath)
	if !ok {
		return false
	}

	err := command.Run()
	if err == nil {
		return true
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
		return false
	}

	log.Debug().Err(err).Str("path", relativePath).Msg("git check-ignore failed")
	return false
}

func (w *worktreeWatcher) shouldAlwaysWatchRelativePath(relativePath string) bool {
	for part := range strings.SplitSeq(relativePath, "/") {
		if part == workspace.ContextLinkName {
			return true
		}
	}

	return false
}

func (w *worktreeWatcher) gitWorktreeReady() bool {
	command, ok := w.gitCommand("-C", w.path, "rev-parse", "--is-inside-work-tree")
	if !ok {
		return false
	}
	return command.Run() == nil
}

func (w *worktreeWatcher) gitCommand(args ...string) (*exec.Cmd, bool) {
	return w.gitRunner.Command(args...)
}

func (w *worktreeWatcher) isGitRelativePath(relativePath string) bool {
	return relativePath == ".git" || strings.HasPrefix(relativePath, ".git/")
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
