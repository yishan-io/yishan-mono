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

func (w *worktreeWatcher) close() {
	w.mu.Lock()
	if w.isClosed {
		w.mu.Unlock()
		return
	}
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
	w.mu.Unlock()
	if w.backend != nil {
		w.backend.Close()
	}
}

// Detach under the registry lock; backend shutdown may wait for callbacks that
// need that lock. Never call a backend or user callback while holding it.
func (ws *Watchers) Unwatch(worktreePath string) {
	ws.mu.Lock()
	entry := ws.entries[worktreePath]
	delete(ws.entries, worktreePath)
	var shared *fswatch.Watcher
	if entry != nil {
		shared = ws.detachContextWatcher(entry)
	}
	ws.mu.Unlock()
	if entry != nil {
		entry.close()
	}
	if shared != nil {
		shared.Close()
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

func (ws *Watchers) Close() {
	ws.mu.Lock()
	entries, contexts := ws.entries, ws.contexts
	ws.entries = make(map[string]*worktreeWatcher)
	ws.contexts = make(map[string]*contextWatchRegistration)
	ws.mu.Unlock()
	for _, entry := range entries {
		entry.close()
	}
	for _, registration := range contexts {
		registration.watcher.Close()
	}
}
