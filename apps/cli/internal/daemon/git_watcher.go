package daemon

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/gitexec"
	"yishan/apps/cli/internal/workspace"
)

const watcherDebounce = 200 * time.Millisecond

type worktreeWatcher struct {
	mu             sync.Mutex
	path           string
	contextDir     string // resolved absolute path of the context symlink target (empty if none)
	resolvedGitDir string // actual git directory (may differ from .git when using git worktrees)
	fw             *fsnotify.Watcher
	watchedDirs    map[string]bool
	events         *eventHub
	fileTimer      *time.Timer
	gitTimer       *time.Timer
	changedPaths   []string
	done           chan struct{}
	onGitChanged   func(worktreePath string)
	ignoredDirs    map[string]bool
	gitIgnoreUsable *bool
	gitRunner      gitexec.Runner
}

type workspaceWatchers struct {
	mu           sync.Mutex
	entries      map[string]*worktreeWatcher
	events       *eventHub
	onGitChanged func(worktreePath string)
}

func newWorkspaceWatchers(events *eventHub, onGitChanged func(worktreePath string)) *workspaceWatchers {
	return &workspaceWatchers{
		entries:      make(map[string]*worktreeWatcher),
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

	// .git is a file — read the gitdir pointer
	content, err := os.ReadFile(gitEntry)
	if err != nil {
		return gitEntry
	}

	line := strings.TrimSpace(string(content))
	gitDirPath, ok := strings.CutPrefix(line, "gitdir: ")
	if !ok {
		return gitEntry
	}

	// Resolve relative paths against the worktree directory
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

	resolvedGitDir := resolveGitDir(worktreePath)

	fw, err := fsnotify.NewWatcher()
	if err != nil {
		log.Warn().Err(err).Str("path", worktreePath).Msg("failed to create workspace fsnotify watcher")
		return
	}

	entry := &worktreeWatcher{
		path:           worktreePath,
		resolvedGitDir: resolvedGitDir,
		fw:             fw,
		watchedDirs:    make(map[string]bool),
		ignoredDirs:    make(map[string]bool),
		events:         ws.events,
		done:           make(chan struct{}),
		onGitChanged:   ws.onGitChanged,
		gitRunner:      gitexec.DefaultRunner(),
	}

	if err := entry.addWorkspaceRecursive(worktreePath); err != nil {
		log.Debug().Err(err).Str("target", worktreePath).Msg("failed to recursively watch workspace")
	}

	gitTargets := []string{
		resolvedGitDir,
		filepath.Join(resolvedGitDir, "HEAD"),
		filepath.Join(resolvedGitDir, "index"),
	}
	gitRefsDir := filepath.Join(resolvedGitDir, "refs")
	if fi, err := os.Stat(gitRefsDir); err == nil && fi.IsDir() {
		gitTargets = append(gitTargets, gitRefsDir)
	}

	watchedTargets := make(map[string]bool)
	for _, t := range gitTargets {
		addTarget := t
		if fi, err := os.Stat(t); err == nil && !fi.IsDir() {
			addTarget = filepath.Dir(t)
		}
		if watchedTargets[addTarget] {
			continue
		}
		watchedTargets[addTarget] = true
		if err := fw.Add(addTarget); err != nil {
			log.Debug().Err(err).Str("target", addTarget).Msg("failed to watch git target")
		}
	}

	// Watch the .my-context symlink target directory so that file changes inside
	// the shared context folder (which lives outside the worktree) trigger file
	// tree refresh events.
	contextLinkPath := filepath.Join(worktreePath, workspace.ContextLinkName)
	if target, err := filepath.EvalSymlinks(contextLinkPath); err == nil {
		if fi, err := os.Stat(target); err == nil && fi.IsDir() {
			if err := fw.Add(target); err != nil {
				log.Debug().Err(err).Str("target", target).Msg("failed to watch context directory")
			} else {
				entry.contextDir = target
			}
		}
	}

	go entry.consume()
	ws.entries[worktreePath] = entry
}

func (ws *workspaceWatchers) Unwatch(worktreePath string) {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	entry, ok := ws.entries[worktreePath]
	if !ok {
		return
	}

	entry.close()
	delete(ws.entries, worktreePath)
}

func (ws *workspaceWatchers) Close() {
	ws.mu.Lock()
	defer ws.mu.Unlock()

	for path, entry := range ws.entries {
		entry.close()
		delete(ws.entries, path)
	}
}

func (w *worktreeWatcher) consume() {
	gitEntry := filepath.Join(w.path, ".git")
	for {
		select {
		case <-w.done:
			return
		case event, ok := <-w.fw.Events:
			if !ok {
				return
			}

			w.clearIgnoreCacheIfNeeded(event.Name)

			if event.Has(fsnotify.Create) {
				if fi, err := os.Stat(event.Name); err == nil && fi.IsDir() && w.shouldWatchWorkspaceDir(event.Name) {
					if err := w.addWorkspaceRecursive(event.Name); err != nil {
						log.Debug().Err(err).Str("target", event.Name).Msg("failed to watch newly created directory")
					}
				}
			}

			if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				w.removeWorkspaceWatchesForPath(event.Name)
			}

			// Classify as a git event if the changed path is inside the .git
			// entry (standard repos) or inside the resolved git directory
			// (git worktrees where .git is a file pointing elsewhere).
			isGit := strings.HasPrefix(event.Name, gitEntry) ||
				(w.resolvedGitDir != gitEntry && strings.HasPrefix(event.Name, w.resolvedGitDir))
			if isGit {
				w.scheduleGitEmit()
			} else if w.contextDir != "" && (event.Name == w.contextDir || strings.HasPrefix(event.Name, w.contextDir+string(filepath.Separator))) {
				// Event from the shared context directory: compute a relative
				// path prefixed with the context link name so the frontend can
				// resolve it within the worktree tree.
				relPath, err := filepath.Rel(w.contextDir, event.Name)
				if err != nil {
					relPath = filepath.Base(event.Name)
				}
				if relPath == "." {
					relPath = ""
				}
				w.scheduleFileEmit(filepath.ToSlash(filepath.Join(workspace.ContextLinkName, relPath)))
			} else {
				relPath, err := filepath.Rel(w.path, event.Name)
				if err != nil {
					relPath = event.Name
				}
				w.scheduleFileEmit(filepath.ToSlash(relPath))
			}
		case watchErr := <-w.fw.Errors:
			if watchErr != nil {
				log.Warn().Err(watchErr).Str("path", w.path).Msg("fsnotify watch error — may indicate inotify limit reached")
			}
		}
	}
}

func (w *worktreeWatcher) addWorkspaceRecursive(root string) error {
	if !w.shouldWatchWorkspaceDir(root) {
		return nil
	}

	if err := w.addSingleWorkspaceWatch(root); err != nil {
		return err
	}

	candidateDirs := make([]string, 0)
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path != root && !w.shouldWatchWorkspaceDirWithoutGitIgnore(path) {
			return filepath.SkipDir
		}
		if path == root {
			return nil
		}
		candidateDirs = append(candidateDirs, path)
		return nil
	})
	if err != nil {
		return err
	}

	ignoredDirs := w.gitCheckIgnoredDirs(candidateDirs)
	for _, path := range candidateDirs {
		if ignoredDirs[path] {
			continue
		}
		if err := w.addSingleWorkspaceWatch(path); err != nil {
			log.Debug().Err(err).Str("target", path).Msg("failed to add workspace directory watch")
		}
	}

	return nil
}

func (w *worktreeWatcher) addSingleWorkspaceWatch(path string) error {
	// Claim the slot atomically before releasing the lock for the I/O call.
	// This prevents two concurrent goroutines from both passing the "already
	// watched" check and registering duplicate kernel watches for the same path.
	w.mu.Lock()
	if w.watchedDirs[path] {
		w.mu.Unlock()
		return nil
	}
	// Mark as watched before releasing the lock so no other goroutine can
	// attempt the same fw.Add concurrently.
	w.watchedDirs[path] = true
	w.mu.Unlock()

	if err := w.fw.Add(path); err != nil {
		// Roll back the optimistic reservation on failure.
		w.mu.Lock()
		delete(w.watchedDirs, path)
		w.mu.Unlock()
		return err
	}

	return nil
}

func (w *worktreeWatcher) removeWorkspaceWatchesForPath(path string) {
	prefix := path + string(filepath.Separator)

	w.mu.Lock()
	toRemove := make([]string, 0)
	for watched := range w.watchedDirs {
		if watched == path || strings.HasPrefix(watched, prefix) {
			toRemove = append(toRemove, watched)
		}
	}
	w.mu.Unlock()

	// Call fw.Remove outside the lock — it is a syscall and should not block
	// other lock-holders. Collect all the paths first, then delete them from
	// the map in a single locked region.
	for _, watched := range toRemove {
		_ = w.fw.Remove(watched)
	}

	if len(toRemove) > 0 {
		w.mu.Lock()
		for _, watched := range toRemove {
			delete(w.watchedDirs, watched)
		}
		w.mu.Unlock()
	}
}

func (w *worktreeWatcher) shouldWatchWorkspaceDir(path string) bool {
	if !w.shouldWatchWorkspaceDirWithoutGitIgnore(path) {
		return false
	}

	if w.isGitIgnoredDir(path) {
		return false
	}

	return true
}

func (w *worktreeWatcher) shouldWatchWorkspaceDirWithoutGitIgnore(path string) bool {
	rel, err := filepath.Rel(w.path, path)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}

	rel = filepath.Clean(rel)
	parts := strings.Split(rel, string(filepath.Separator))
	for i, part := range parts {
		if part == workspace.ContextLinkName {
			return true
		}
		switch part {
		case ".git":
			if i == 0 {
				return false
			}
		case "node_modules", "dist", "build":
			return false
		case "objects":
			if i > 0 && parts[i-1] == ".git" {
				return false
			}
		}
	}

	return true
}

func (w *worktreeWatcher) gitCheckIgnoredDirs(paths []string) map[string]bool {
	ignoredDirs := make(map[string]bool)
	if len(paths) == 0 || !w.isGitIgnoreUsable() {
		return ignoredDirs
	}

	relativePaths := make([]string, 0, len(paths))
	pathByRelativePath := make(map[string]string, len(paths))
	for _, path := range paths {
		rel, err := filepath.Rel(w.path, path)
		if err != nil || rel == "." {
			continue
		}
		rel = filepath.ToSlash(filepath.Clean(rel))
		if w.shouldAlwaysWatchRelativePath(rel) {
			continue
		}
		relativePaths = append(relativePaths, rel)
		pathByRelativePath[rel] = path
	}

	for rel := range w.gitCheckIgnoreMany(relativePaths) {
		path := pathByRelativePath[rel]
		if path == "" {
			continue
		}
		ignoredDirs[path] = true

		w.mu.Lock()
		w.ignoredDirs[rel] = true
		w.mu.Unlock()
	}

	return ignoredDirs
}

func (w *worktreeWatcher) isGitIgnoredDir(path string) bool {
	if !w.isGitIgnoreUsable() {
		return false
	}

	rel, err := filepath.Rel(w.path, path)
	if err != nil || rel == "." {
		return false
	}
	rel = filepath.ToSlash(filepath.Clean(rel))

	w.mu.Lock()
	if ignored, ok := w.ignoredDirs[rel]; ok {
		w.mu.Unlock()
		return ignored
	}
	w.mu.Unlock()

	ignored := w.gitCheckIgnore(rel)

	w.mu.Lock()
	w.ignoredDirs[rel] = ignored
	w.mu.Unlock()
	return ignored
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
	base := filepath.Base(changedPath)
	if base != ".gitignore" && base != ".git" {
		return
	}

	w.mu.Lock()
	w.ignoredDirs = make(map[string]bool)
	w.mu.Unlock()
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

func (w *worktreeWatcher) gitCheckIgnoreMany(relativePaths []string) map[string]bool {
	ignored := make(map[string]bool)
	if len(relativePaths) == 0 {
		return ignored
	}

	command, ok := w.gitCommand("-C", w.path, "check-ignore", "-z", "--stdin")
	if !ok {
		return ignored
	}

	command.Stdin = strings.NewReader(strings.Join(relativePaths, "\x00") + "\x00")
	output, err := command.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if !errors.As(err, &exitErr) || exitErr.ExitCode() != 1 {
			log.Debug().Err(err).Int("pathCount", len(relativePaths)).Msg("git check-ignore batch failed")
		}
		output = append([]byte(nil), output...)
	}

	for _, part := range bytes.Split(output, []byte{0}) {
		if len(part) == 0 {
			continue
		}
		ignored[string(part)] = true
	}

	return ignored
}

func (w *worktreeWatcher) gitWorktreeReady() bool {
	command, ok := w.gitCommand("-C", w.path, "rev-parse", "--is-inside-work-tree")
	if !ok {
		return false
	}
	err := command.Run()
	return err == nil
}

func (w *worktreeWatcher) gitCommand(args ...string) (*exec.Cmd, bool) {
	return w.gitRunner.Command(args...)
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
		for p := range deduped {
			changedPaths = append(changedPaths, p)
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
	for _, p := range paths {
		seen[p] = true
	}
	return seen
}

func (w *worktreeWatcher) scheduleGitEmit() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.gitTimer != nil {
		w.gitTimer.Stop()
	}

	w.gitTimer = time.AfterFunc(watcherDebounce, func() {
		w.mu.Lock()
		w.gitTimer = nil
		w.mu.Unlock()

		w.events.Publish(frontendEvent{
			Topic: "gitChanged",
			Payload: map[string]any{
				"workspaceWorktreePath": w.path,
			},
		})
		if w.onGitChanged != nil {
			go w.onGitChanged(w.path)
		}
	})
}

func (w *worktreeWatcher) close() {
	close(w.done)
	w.fw.Close()

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
