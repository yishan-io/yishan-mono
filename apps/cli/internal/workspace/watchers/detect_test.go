package watchers

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWorktreeWatcher_DetectsGitChangesInResolvedDir(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "HEAD"), []byte("ref: refs/heads/main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "index"), []byte("fake-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	worktreeDir := filepath.Join(root, "worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitFileContent := "gitdir: " + actualGitDir + "\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", worktreeDir)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	if err := os.WriteFile(filepath.Join(actualGitDir, "index"), []byte("updated-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	event := expectEventTopic(t, events, "gitChanged")
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatal("expected map payload")
	}
	if payload["workspaceWorktreePath"] != worktreeDir {
		t.Errorf("expected worktreePath %q, got %q", worktreeDir, payload["workspaceWorktreePath"])
	}
}

func TestWorktreeWatcher_DetectsGitChangesInStandardRepo(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref: refs/heads/main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gitDir, "index"), []byte("fake-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	if err := os.WriteFile(filepath.Join(gitDir, "index"), []byte("updated-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	expectEventTopic(t, events, "gitChanged")
}

func TestWorktreeWatcher_InvokesGitChangedCallback(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref: refs/heads/main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gitDir, "index"), []byte("fake-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	callbackPaths := make(chan string, 1)
	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, func(worktreePath string) {
		callbackPaths <- worktreePath
	})
	defer watchers.Close()

	watchers.Watch("ws-test", root)
	time.Sleep(500 * time.Millisecond)

	if err := os.WriteFile(filepath.Join(gitDir, "index"), []byte("updated-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-callbackPaths:
		if got != root {
			t.Fatalf("expected callback for %q, got %q", root, got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for git callback")
	}
}

func TestWorktreeWatcher_DetectsFileChangesInWorktree(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	filePath := filepath.Join(root, "tracked.txt")
	if err := os.WriteFile(filePath, []byte("initial"), 0o644); err != nil {
		t.Fatal(err)
	}
	stopWrites := make(chan struct{})
	go writeUntilEvent(filePath, "hello", 250*time.Millisecond, stopWrites)
	event := expectEventTopic(t, events, "workspaceFilesChanged")
	close(stopWrites)
	expectChangedPathInSet(t, event, []string{"tracked.txt", ""})
}

func TestWorktreeWatcher_DetectsFileChangesInSubdirectory(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "nested", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	if err := os.WriteFile(filepath.Join(root, "nested", "deep", "child.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	expectChangedPathInSet(t, expectEventTopic(t, events, "workspaceFilesChanged"), []string{"nested/deep/child.txt", "nested/deep", "nested"})
}

func TestWorktreeWatcher_DetectsFileChangesInNewDirectories(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	newDir := filepath.Join(root, "created", "sub")
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "file.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	expectChangedPath(t, expectEventTopic(t, events, "workspaceFilesChanged"), "created/sub/file.txt")

	if err := os.RemoveAll(filepath.Join(root, "created")); err != nil {
		t.Fatal(err)
	}

	expectEventTopic(t, events, "workspaceFilesChanged")
}
