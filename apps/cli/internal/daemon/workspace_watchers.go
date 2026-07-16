package daemon

import (
	"os"
	"path/filepath"
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
	workspaceID          string
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

func (ws *workspaceWatchers) Watch(workspaceID string, worktreePath string) {
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
		workspaceID:    workspaceID,
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
