package watchers

import (
	"context"
	"strings"
	"time"
)

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

		if w.sink != nil {
			w.sink.PublishWorkspaceFilesChanged(FilesChangedEvent{
				WorkspaceID:          w.workspaceID,
				WorktreePath:         w.path,
				ChangedRelativePaths: changedPaths,
			})
		}
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

		event := GitChangedEvent{
			WorkspaceID:   w.workspaceID,
			WorktreePath:  w.path,
			AffectsBranch: affects,
		}
		if affects {
			event.CurrentBranch = w.readCurrentBranch()
		}

		if w.sink != nil {
			w.sink.PublishGitChanged(event)
		}
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
