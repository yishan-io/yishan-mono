package watchers

import (
	"context"
	"time"
	"yishan/apps/cli/internal/workspace/watchers/fswatch"
)

func (w *worktreeWatcher) commandParent() context.Context {
	if w.gitContext != nil {
		return w.gitContext
	}
	return context.Background()
}

func (w *worktreeWatcher) canNotify() bool {
	w.mu.Lock()
	isClosed := w.isClosed
	w.mu.Unlock()
	return !isClosed && w.hasWorktreeDirectory()
}

// seal closes admission under the same lock used to register notifications.
func (w *worktreeWatcher) seal(shared *fswatch.Watcher) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.isClosed {
		return
	}
	w.closeDone = make(chan struct{})
	w.sharedBackend = shared
	w.isClosed = true
	if w.gitCancel != nil {
		w.gitCancel()
	}
	if w.done != nil {
		close(w.done)
	}
	for _, timer := range []*time.Timer{w.fileTimer, w.gitTimer, w.ordinaryTimer} {
		if timer != nil {
			timer.Stop()
		}
	}
	w.fileTimer, w.gitTimer, w.ordinaryTimer = nil, nil, nil
	w.changedPaths, w.ordinaryPending, w.ordinaryInflight = nil, nil, nil
	w.hasChangedPathsOverflow, w.hasOrdinaryOverflow = false, false
	w.ordinaryOrder = nil
	w.pendingAffectsBranch, w.hasPendingGit = false, false
	w.ignoredPaths = nil
	w.ignoreGeneration++
}

func (w *worktreeWatcher) close() {
	w.seal(nil)
	w.closeOnce.Do(func() {
		if w.backend != nil {
			w.backend.Close()
		}
		if w.sharedBackend != nil {
			w.sharedBackend.Close()
		}
		w.notifications.Wait()
		close(w.closeDone)
	})
	<-w.closeDone
}

func (w *worktreeWatcher) isClosing() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.isClosed
}

// Unwatch seals and drains notifications, including an already-closing entry.
// Owning callbacks must not call this synchronously.
func (ws *Watchers) Unwatch(worktreePath string) {
	ws.mu.Lock()
	entry := ws.entries[worktreePath]
	if entry != nil {
		entry.seal(ws.detachContextWatcher(entry))
	}
	ws.mu.Unlock()
	if entry != nil {
		entry.close()
		if entry.beforeRegistryCleanup != nil {
			entry.beforeRegistryCleanup()
		}
		ws.removeClosedEntry(entry)
	}
}

func (ws *Watchers) removeClosedEntry(entry *worktreeWatcher) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if ws.entries[entry.path] == entry {
		delete(ws.entries, entry.path)
	}
}

func (ws *Watchers) detachContextWatcher(entry *worktreeWatcher) *fswatch.Watcher {
	registration := ws.contexts[entry.contextDir]
	if registration == nil {
		return nil
	}
	delete(registration.workspacePaths, entry.path)
	if len(registration.workspacePaths) != 0 {
		return nil
	}
	delete(ws.contexts, entry.contextDir)
	return registration.watcher
}

// Close seals all entries captured under the registry lock before draining any.
// It also joins already-closing entries, but does not disable future Watch calls.
// Owning callbacks must not call this synchronously.
func (ws *Watchers) Close() {
	ws.mu.Lock()
	entries := make([]*worktreeWatcher, 0, len(ws.entries))
	for _, entry := range ws.entries {
		entry.seal(ws.detachContextWatcher(entry))
		entries = append(entries, entry)
	}
	ws.mu.Unlock()
	for _, entry := range entries {
		entry.close()
		if entry.beforeRegistryCleanup != nil {
			entry.beforeRegistryCleanup()
		}
		ws.removeClosedEntry(entry)
	}
}
