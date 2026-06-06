package daemon

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/fswatch"
	"yishan/apps/cli/internal/gitexec"
	"yishan/apps/cli/internal/workspace"
)

const (
	watcherDebounce   = 200 * time.Millisecond
	watcherStartupLag = 300 * time.Millisecond
	gitInfoExcludeRel = ".git/info/exclude"
)

type worktreeWatcher struct {
	mu                   sync.Mutex
	path                 string
	contextDir           string
	resolvedGitDir       string
	events               *eventHub
	fileTimer            *time.Timer
	gitTimer             *time.Timer
	pendingAffectsBranch bool
	readyAt              time.Time
	changedPaths         []string
	done                 chan struct{}
	onGitChanged         func(worktreePath string)
	ignoredPaths         map[string]bool
	gitIgnoreUsable      *bool
	gitRunner            gitexec.Runner
	backend              *fswatch.Watcher
}

type contextWatchRegistration struct {
	watcher        *fswatch.Watcher
	workspacePaths map[string]bool
}

type workspaceWatchers struct {
	mu           sync.Mutex
	entries      map[string]*worktreeWatcher
	contexts     map[string]*contextWatchRegistration
	events       *eventHub
	onGitChanged func(worktreePath string)
}

func newWorkspaceWatchers(events *eventHub, onGitChanged func(worktreePath string)) *workspaceWatchers {
	return &workspaceWatchers{
		entries:      make(map[string]*worktreeWatcher),
		contexts:     make(map[string]*contextWatchRegistration),
		events:       events,
		onGitChanged: onGitChanged,
	}
}

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

func (ws *workspaceWatchers) Watch(worktreePath string) {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	if _, ok := ws.entries[worktreePath]; ok {
		return
	}

	gitEntry := filepath.Join(worktreePath, ".git")
	if _, err := os.Stat(gitEntry); err != nil {
		return
	}

	entry := &worktreeWatcher{
		path:           worktreePath,
		resolvedGitDir: resolveGitDir(worktreePath),
		events:         ws.events,
		readyAt:        time.Now().Add(watcherStartupLag),
		done:           make(chan struct{}),
		onGitChanged:   ws.onGitChanged,
		ignoredPaths:   make(map[string]bool),
		gitRunner:      gitexec.DefaultRunner(),
	}

	contextLinkPath := filepath.Join(worktreePath, workspace.ContextLinkName)
	if target, err := filepath.EvalSymlinks(contextLinkPath); err == nil {
		if info, statErr := os.Stat(target); statErr == nil && info.IsDir() {
			entry.contextDir = target
		}
	}

	backend, err := fswatch.New(fswatch.Config{
		RecursivePaths:    []string{entry.path},
		NonRecursivePaths: nonRecursiveWatchPaths(entry),
		ShouldWatchDir:    entry.shouldWatchWorkspaceDir,
		ShouldDescendDir:  entry.shouldWatchWorkspaceDirWithoutGitIgnore,
		OnPathChanged:     entry.handleChangedPath,
		OnError: func(err error) {
			log.Warn().Err(err).Str("path", worktreePath).Msg("workspace watcher error")
		},
	})
	if err != nil {
		log.Warn().Err(err).Str("path", worktreePath).Msg("failed to create workspace watcher")
		return
	}
	entry.backend = backend
	ws.entries[worktreePath] = entry
	ws.registerContextWatcher(entry)
}

func nonRecursiveWatchPaths(entry *worktreeWatcher) []string {
	paths := []string{entry.resolvedGitDir}
	gitRefsDir := filepath.Join(entry.resolvedGitDir, "refs")
	if info, err := os.Stat(gitRefsDir); err == nil && info.IsDir() {
		paths = append(paths, gitRefsDir)
	}
	return paths
}

func (ws *workspaceWatchers) registerContextWatcher(entry *worktreeWatcher) {
	if entry.contextDir == "" {
		return
	}

	registration, ok := ws.contexts[entry.contextDir]
	if ok {
		registration.workspacePaths[entry.path] = true
		return
	}

	contextDir := entry.contextDir
	watcher, err := fswatch.New(fswatch.Config{
		RecursivePaths: []string{contextDir},
		OnPathChanged: func(changedPath string) {
			ws.handleSharedContextPathChanged(contextDir, changedPath)
		},
		OnError: func(err error) {
			log.Warn().Err(err).Str("path", contextDir).Msg("shared context watcher error")
		},
	})
	if err != nil {
		log.Warn().Err(err).Str("path", contextDir).Msg("failed to create shared context watcher")
		return
	}

	ws.contexts[contextDir] = &contextWatchRegistration{
		watcher:        watcher,
		workspacePaths: map[string]bool{entry.path: true},
	}
}

func (ws *workspaceWatchers) handleSharedContextPathChanged(contextDir string, changedPath string) {
	ws.mu.Lock()
	registration, ok := ws.contexts[contextDir]
	if !ok {
		ws.mu.Unlock()
		return
	}

	watchers := make([]*worktreeWatcher, 0, len(registration.workspacePaths))
	for workspacePath := range registration.workspacePaths {
		if entry, ok := ws.entries[workspacePath]; ok {
			watchers = append(watchers, entry)
		}
	}
	ws.mu.Unlock()

	for _, watcher := range watchers {
		watcher.handleChangedPath(changedPath)
	}
}

func (ws *workspaceWatchers) unregisterContextWatcher(entry *worktreeWatcher) {
	if entry.contextDir == "" {
		return
	}

	registration, ok := ws.contexts[entry.contextDir]
	if !ok {
		return
	}

	delete(registration.workspacePaths, entry.path)
	if len(registration.workspacePaths) > 0 {
		return
	}

	registration.watcher.Close()
	delete(ws.contexts, entry.contextDir)
}

func (ws *workspaceWatchers) Unwatch(worktreePath string) {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	entry, ok := ws.entries[worktreePath]
	if !ok {
		return
	}

	ws.unregisterContextWatcher(entry)
	entry.close()
	delete(ws.entries, worktreePath)
}

func (ws *workspaceWatchers) Close() {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	for contextDir, registration := range ws.contexts {
		registration.watcher.Close()
		delete(ws.contexts, contextDir)
	}

	for path, entry := range ws.entries {
		entry.close()
		delete(ws.entries, path)
	}
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

func (w *worktreeWatcher) scheduleFileEmit(relPath string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.changedPaths = append(w.changedPaths, relPath)

	if w.fileTimer != nil {
		w.fileTimer.Stop()
	}

	w.fileTimer = time.AfterFunc(watcherDebounce, func() {
		w.mu.Lock()
		paths := w.changedPaths
		w.changedPaths = nil
		w.fileTimer = nil
		w.mu.Unlock()

		deduped := dedupePaths(paths)
		changedPaths := make([]string, 0, len(deduped))
		for path := range deduped {
			changedPaths = append(changedPaths, path)
		}

		w.events.Publish(frontendEvent{
			Topic: "workspaceFilesChanged",
			Payload: map[string]any{
				"workspaceWorktreePath": w.path,
				"changedRelativePaths":  changedPaths,
			},
		})
	})
}

func dedupePaths(paths []string) map[string]bool {
	seen := make(map[string]bool, len(paths))
	for _, path := range paths {
		seen[path] = true
	}
	return seen
}

func (w *worktreeWatcher) readCurrentBranch() string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err, ok := w.gitRunner.Run(ctx, w.path, "rev-parse", "--abbrev-ref", "HEAD")
	if !ok || err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
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

func (w *worktreeWatcher) scheduleGitEmit(affectsBranch bool) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if affectsBranch {
		w.pendingAffectsBranch = true
	}
	if w.gitTimer != nil {
		w.gitTimer.Stop()
	}

	w.gitTimer = time.AfterFunc(watcherDebounce, func() {
		w.mu.Lock()
		w.gitTimer = nil
		affects := w.pendingAffectsBranch
		w.pendingAffectsBranch = false
		w.mu.Unlock()

		payload := map[string]any{
			"workspaceWorktreePath": w.path,
			"affectsBranch":         affects,
		}
		if affects {
			if branch := w.readCurrentBranch(); branch != "" {
				payload["currentBranch"] = branch
			}
		}

		w.events.Publish(frontendEvent{
			Topic:   "gitChanged",
			Payload: payload,
		})
		if w.onGitChanged != nil {
			go w.onGitChanged(w.path)
		}
	})
}

func (w *worktreeWatcher) close() {
	close(w.done)
	if w.backend != nil {
		w.backend.Close()
	}

	w.mu.Lock()
	if w.fileTimer != nil {
		w.fileTimer.Stop()
		w.fileTimer = nil
	}
	if w.gitTimer != nil {
		w.gitTimer.Stop()
		w.gitTimer = nil
	}
	w.changedPaths = nil
	w.mu.Unlock()
}
