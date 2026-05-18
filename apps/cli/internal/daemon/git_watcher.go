package daemon

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/rs/zerolog/log"
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
		events:         ws.events,
		done:           make(chan struct{}),
		onGitChanged:   ws.onGitChanged,
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
		case <-w.fw.Errors:
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

	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path != root && !w.shouldWatchWorkspaceDir(path) {
			return filepath.SkipDir
		}
		if path == root {
			return nil
		}
		if err := w.addSingleWorkspaceWatch(path); err != nil {
			log.Debug().Err(err).Str("target", path).Msg("failed to add workspace directory watch")
		}
		return nil
	})
}

func (w *worktreeWatcher) addSingleWorkspaceWatch(path string) error {
	w.mu.Lock()
	if w.watchedDirs[path] {
		w.mu.Unlock()
		return nil
	}
	w.mu.Unlock()

	if err := w.fw.Add(path); err != nil {
		return err
	}

	w.mu.Lock()
	w.watchedDirs[path] = true
	w.mu.Unlock()

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

	for _, watched := range toRemove {
		_ = w.fw.Remove(watched)
		w.mu.Lock()
		delete(w.watchedDirs, watched)
		w.mu.Unlock()
	}
}

func (w *worktreeWatcher) shouldWatchWorkspaceDir(path string) bool {
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
