package watchers

import (
	"time"
)

func (w *worktreeWatcher) scheduleFileEmit(relPath string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.appendFileChangeLocked(relPath)
}

func (w *worktreeWatcher) appendFileChangeLocked(relPath string) {
	if w.isClosed {
		return
	}
	for _, path := range w.changedPaths {
		if path == relPath {
			return
		}
	}
	if len(w.changedPaths) < maxChangedPathsPerEvent {
		w.changedPaths = append(w.changedPaths, relPath)
	} else {
		w.hasChangedPathsOverflow = true
	}
	if w.fileTimer == nil {
		w.fileTimer = time.AfterFunc(watcherDebounce, w.emitFilesChanged)
	}
}

func (w *worktreeWatcher) emitFilesChanged() {
	w.mu.Lock()
	paths := w.changedPaths
	hasOverflow := w.hasChangedPathsOverflow
	w.changedPaths = nil
	w.hasChangedPathsOverflow = false
	w.mu.Unlock()
	defer w.finishFileEmit()

	if !w.hasWorktreeDirectory() || !w.admitNotification() {
		return
	}
	defer w.finishNotification()

	changedPaths := boundChangedPaths(paths)
	if hasOverflow {
		changedPaths = []string{}
	}

	if w.sink != nil {
		w.sink.PublishWorkspaceFilesChanged(FilesChangedEvent{
			WorkspaceID:          w.workspaceID,
			WorktreePath:         w.path,
			ChangedRelativePaths: changedPaths,
		})
	}
}

// boundChangedPaths returns an empty path list when a file burst exceeds the
// event payload budget. The renderer treats an empty list as a full refresh,
// preserving correctness without sending an unbounded WebSocket message.
func boundChangedPaths(paths []string) []string {
	deduped := dedupePaths(paths)
	if len(deduped) > maxChangedPathsPerEvent {
		return []string{}
	}

	changedPaths := make([]string, 0, len(deduped))
	for path := range deduped {
		changedPaths = append(changedPaths, path)
	}
	return changedPaths
}

func dedupePaths(paths []string) map[string]bool {
	seen := make(map[string]bool, len(paths))
	for _, path := range paths {
		seen[path] = true
	}
	return seen
}

func (w *worktreeWatcher) readCurrentBranch() string {
	ctx, cancel := w.ignoreContext(w.commandParent())
	defer cancel()
	branch, err := w.gitOperations().HeadName(ctx, w.path)
	if ctx.Err() != nil || err != nil {
		return ""
	}
	return branch
}

func (w *worktreeWatcher) scheduleGitEmit(affectsBranch bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.isClosed {
		return
	}

	w.hasPendingGit = true
	if affectsBranch {
		w.pendingAffectsBranch = true
	}
	if w.gitTimer == nil {
		w.gitTimer = time.AfterFunc(watcherDebounce, w.emitGitChanged)
	}
}

func (w *worktreeWatcher) emitGitChanged() {
	w.mu.Lock()
	w.hasPendingGit = false
	affects := w.pendingAffectsBranch
	w.pendingAffectsBranch = false
	w.mu.Unlock()
	defer w.finishGitEmit()

	if !w.canNotify() {
		return
	}

	event := GitChangedEvent{
		WorkspaceID:   w.workspaceID,
		WorktreePath:  w.path,
		AffectsBranch: affects,
	}
	if affects {
		event.CurrentBranch = w.readCurrentBranch()
	}

	if !w.hasWorktreeDirectory() || !w.admitNotification() {
		return
	}
	defer w.finishNotification()
	if w.sink != nil {
		w.sink.PublishGitChanged(event)
	}
	w.invokeGitChanged()
}

func (w *worktreeWatcher) notifyGitChanged() {
	if !w.hasWorktreeDirectory() || !w.admitNotification() {
		return
	}
	defer w.finishNotification()
	w.invokeGitChanged()
}

func (w *worktreeWatcher) invokeGitChanged() {
	if w.onGitChanged != nil && w.hasWorktreeDirectory() {
		w.onGitChanged(w.path)
	}
}

// Keep the timer occupied through sink execution: slow sinks cannot spawn an
// unbounded number of concurrent timer callbacks under sustained input.
func (w *worktreeWatcher) finishFileEmit() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.fileTimer = nil
	if !w.isClosed && (len(w.changedPaths) > 0 || w.hasChangedPathsOverflow) {
		w.fileTimer = time.AfterFunc(watcherDebounce, w.emitFilesChanged)
	}
}

func (w *worktreeWatcher) finishGitEmit() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.gitTimer = nil
	if !w.isClosed && w.hasPendingGit {
		w.gitTimer = time.AfterFunc(watcherDebounce, w.emitGitChanged)
	}
}
