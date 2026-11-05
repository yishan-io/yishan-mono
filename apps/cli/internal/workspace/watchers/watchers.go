package watchers

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/watchers/fswatch"
)

const (
	watcherDebounce         = 200 * time.Millisecond
	watcherStartupLag       = 300 * time.Millisecond
	gitInfoExcludeRel       = ".git/info/exclude"
	maxChangedPathsPerEvent = 250
)

type FilesChangedEvent struct {
	WorkspaceID          string
	WorktreePath         string
	ChangedRelativePaths []string
}

type GitChangedEvent struct {
	WorkspaceID   string
	WorktreePath  string
	AffectsBranch bool
	CurrentBranch string
}

// Sink callbacks must not synchronously call Watch, Unwatch, or Close on their
// owning Watchers. Request lifecycle work asynchronously without waiting.
type Sink interface {
	PublishWorkspaceFilesChanged(FilesChangedEvent)
	PublishGitChanged(GitChangedEvent)
}

// watcherGit leaves command protocol to Git and scheduling policy to the watcher.
type watcherGit interface {
	WorktreeReady(context.Context, string) error
	CheckIgnoredPaths(context.Context, string, []string) (map[string]bool, error)
	HeadName(context.Context, string) (string, error)
}

type worktreeWatcher struct {
	mu            sync.Mutex
	notifications sync.WaitGroup
	closeOnce     sync.Once
	closeDone     chan struct{}
	// beforeRegistryCleanup is an optional drain-to-registry handoff barrier.
	beforeRegistryCleanup   func()
	sharedBackend           *fswatch.Watcher
	workspaceID             string
	path                    string
	contextDir              string
	resolvedGitDir          string
	sink                    Sink
	fileTimer               *time.Timer
	gitTimer                *time.Timer
	pendingAffectsBranch    bool
	readyAt                 time.Time
	changedPaths            []string
	hasChangedPathsOverflow bool
	done                    chan struct{}
	onGitChanged            func(worktreePath string)
	ignoredPaths            map[string]bool
	gitIgnoreUsable         *bool
	ignoreGeneration        uint64
	ignoreProbeDone         chan struct{}
	gitCancel               context.CancelFunc
	isClosed                bool
	ordinaryPending         map[string]bool
	ordinaryOrder           []string
	hasPendingGit           bool
	ordinaryInflight        map[string]bool
	ordinaryTimer           *time.Timer
	isOrdinaryActive        bool
	hasOrdinaryOverflow     bool
	gitContext              context.Context
	gitService              watcherGit
	backend                 *fswatch.Watcher
}

type contextWatchRegistration struct {
	watcher        *fswatch.Watcher
	workspacePaths map[string]bool
}

type Watchers struct {
	mu           sync.Mutex
	entries      map[string]*worktreeWatcher
	contexts     map[string]*contextWatchRegistration
	sink         Sink
	onGitChanged func(worktreePath string)
}

// New registers sinks and a Git callback. Callbacks must not synchronously call
// owning Watchers lifecycle methods; asynchronous requests must not wait.
func New(sink Sink, onGitChanged func(worktreePath string)) *Watchers {
	return &Watchers{
		entries:      make(map[string]*worktreeWatcher),
		contexts:     make(map[string]*contextWatchRegistration),
		sink:         sink,
		onGitChanged: onGitChanged,
	}
}

// IsWatching reports whether a watcher is currently registered for the given
// worktree path.
func (ws *Watchers) IsWatching(worktreePath string) bool {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	entry := ws.entries[worktreePath]
	return entry != nil && !entry.isClosing()
}

// Watch registers a workspace, waiting for any closing same-path entry first.
// Owning callbacks must not call this synchronously.
func (ws *Watchers) Watch(workspaceID string, worktreePath string) error {
	for {
		ws.mu.Lock()
		previous := ws.entries[worktreePath]
		if previous != nil && previous.isClosing() {
			ws.mu.Unlock()
			<-previous.closeDone
			ws.removeClosedEntry(previous)
			continue
		}
		if previous != nil {
			ws.mu.Unlock()
			return nil
		}
		entry, err := ws.newWorktreeWatcher(workspaceID, worktreePath)
		if err == nil {
			ws.entries[worktreePath] = entry
			ws.registerContextWatcher(entry)
		}
		ws.mu.Unlock()
		return err
	}
}

func (ws *Watchers) newWorktreeWatcher(workspaceID string, worktreePath string) (*worktreeWatcher, error) {
	gitEntry := filepath.Join(worktreePath, ".git")
	if _, err := os.Stat(gitEntry); err != nil {
		return nil, fmt.Errorf("inspect workspace git entry: %w", err)
	}
	entry := ws.buildWorktreeWatcher(workspaceID, worktreePath)
	backend, err := fswatch.New(fswatch.Config{
		RecursivePaths: []string{entry.path}, NonRecursivePaths: nonRecursiveWatchPaths(entry),
		ShouldWatchDir: entry.shouldWatchWorkspaceDir, ShouldDescendDir: entry.shouldWatchWorkspaceDirWithoutGitIgnore,
		OnPathChanged: entry.handleChangedPath,
		OnError:       func(err error) { log.Warn().Err(err).Str("path", worktreePath).Msg("workspace watcher error") },
	})
	if err != nil {
		entry.seal(nil)
		log.Warn().Err(err).Str("path", worktreePath).Msg("failed to create workspace watcher")
		return nil, fmt.Errorf("create workspace watcher: %w", err)
	}
	entry.backend = backend
	return entry, nil
}

func (ws *Watchers) buildWorktreeWatcher(workspaceID string, worktreePath string) *worktreeWatcher {
	gitContext, cancelGit := context.WithCancel(context.Background())
	entry := &worktreeWatcher{
		gitContext: gitContext, gitCancel: cancelGit,
		workspaceID: workspaceID, path: worktreePath, resolvedGitDir: ResolveGitDir(worktreePath), sink: ws.sink,
		readyAt: time.Now().Add(watcherStartupLag), done: make(chan struct{}), onGitChanged: ws.onGitChanged,
		ignoredPaths: make(map[string]bool), gitService: git.NewGitService(),
	}

	contextLinkPath := filepath.Join(worktreePath, workspace.ContextLinkName)
	if target, err := filepath.EvalSymlinks(contextLinkPath); err == nil {
		if info, statErr := os.Stat(target); statErr == nil && info.IsDir() {
			entry.contextDir = target
		}
	}
	return entry
}

func (ws *Watchers) registerContextWatcher(entry *worktreeWatcher) {
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

func (ws *Watchers) handleSharedContextPathChanged(contextDir string, changedPath string) {
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

func ResolveGitDir(worktreePath string) string {
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
