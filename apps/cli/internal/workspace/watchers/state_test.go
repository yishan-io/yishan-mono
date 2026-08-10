package watchers

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func removeWorktree(t *testing.T, worktreePath string) {
	t.Helper()
	if err := os.RemoveAll(worktreePath); err != nil {
		t.Fatal(err)
	}
}

func replaceWorktreeWithFile(t *testing.T, worktreePath string) {
	t.Helper()
	removeWorktree(t, worktreePath)
	if err := os.WriteFile(worktreePath, nil, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestWorktreeWatcher_HandleChangedPathSkipsMissingWorktree(t *testing.T) {
	worktreePath := t.TempDir()
	hub := newEventHub()
	watcher := &worktreeWatcher{
		workspaceID:    "workspace-1",
		path:           worktreePath,
		resolvedGitDir: filepath.Join(worktreePath, ".git"),
		sink:           eventHubWatcherSink{events: hub},
		readyAt:        time.Now().Add(-time.Minute),
	}

	removeWorktree(t, worktreePath)
	watcher.handleChangedPath(filepath.Join(worktreePath, ".git", "index"))

	expectNoEvent(t, hub.events, watcherDebounce+100*time.Millisecond)
}

func TestWorktreeWatcher_HandleChangedPathSkipsNonDirectoryWorktree(t *testing.T) {
	worktreePath := t.TempDir()
	hub := newEventHub()
	watcher := &worktreeWatcher{
		workspaceID:    "workspace-1",
		path:           worktreePath,
		resolvedGitDir: filepath.Join(worktreePath, ".git"),
		sink:           eventHubWatcherSink{events: hub},
		readyAt:        time.Now().Add(-time.Minute),
	}

	replaceWorktreeWithFile(t, worktreePath)
	watcher.handleChangedPath(filepath.Join(worktreePath, ".git", "index"))

	expectNoEvent(t, hub.events, watcherDebounce+100*time.Millisecond)
}
