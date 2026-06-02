package daemon

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func initGitRepo(t *testing.T, root string) {
	t.Helper()
	cmd := exec.Command("git", "init", root)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init failed: %v (%s)", err, string(output))
	}
}

func TestResolveGitDir_StandardRepo(t *testing.T) {
	root := t.TempDir()
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(root)
	if resolved != gitDir {
		t.Errorf("expected %q, got %q", gitDir, resolved)
	}
}

func TestResolveGitDir_WorktreeFile(t *testing.T) {
	root := t.TempDir()

	// Create the actual git directory that the worktree points to
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Create HEAD and index in the actual git dir
	if err := os.WriteFile(filepath.Join(actualGitDir, "HEAD"), []byte("ref: refs/heads/my-branch\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "index"), []byte("fake-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create the worktree directory with a .git file
	worktreeDir := filepath.Join(root, "worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitFileContent := "gitdir: " + actualGitDir + "\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(worktreeDir)
	if resolved != actualGitDir {
		t.Errorf("expected %q, got %q", actualGitDir, resolved)
	}
}

func TestResolveGitDir_WorktreeFileRelativePath(t *testing.T) {
	root := t.TempDir()

	// Create the actual git directory
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a worktree with a relative gitdir path
	worktreeDir := filepath.Join(root, "main-repo", "worktrees", "my-worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Relative path from worktreeDir to actualGitDir
	gitFileContent := "gitdir: ../../.git/worktrees/my-worktree\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(worktreeDir)
	if resolved != actualGitDir {
		t.Errorf("expected %q, got %q", actualGitDir, resolved)
	}
}

func TestResolveGitDir_NoGitEntry(t *testing.T) {
	root := t.TempDir()

	resolved := resolveGitDir(root)
	expected := filepath.Join(root, ".git")
	if resolved != expected {
		t.Errorf("expected %q, got %q", expected, resolved)
	}
}

func TestResolveGitDir_InvalidGitFileContent(t *testing.T) {
	root := t.TempDir()

	// Write a .git file without the "gitdir: " prefix
	if err := os.WriteFile(filepath.Join(root, ".git"), []byte("some-random-content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(root)
	expected := filepath.Join(root, ".git")
	if resolved != expected {
		t.Errorf("expected %q, got %q", expected, resolved)
	}
}

// evalSymlinks resolves symlinks for temp dirs (macOS /var -> /private/var).
func evalSymlinks(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func TestWorktreeWatcher_DetectsGitChangesInResolvedDir(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())

	// Create the actual git directory (simulating a worktree)
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

	// Create the worktree directory with .git file
	worktreeDir := filepath.Join(root, "worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitFileContent := "gitdir: " + actualGitDir + "\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch(worktreeDir)

	// Modify the index file in the resolved git directory
	time.Sleep(100 * time.Millisecond) // give watcher time to start
	if err := os.WriteFile(filepath.Join(actualGitDir, "index"), []byte("updated-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Wait for the debounced event
	select {
	case event := <-events:
		if event.Topic != "gitChanged" {
			t.Errorf("expected topic 'gitChanged', got %q", event.Topic)
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			t.Fatal("expected map payload")
		}
		if payload["workspaceWorktreePath"] != worktreeDir {
			t.Errorf("expected worktreePath %q, got %q", worktreeDir, payload["workspaceWorktreePath"])
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for gitChanged event")
	}
}

func TestWorktreeWatcher_DetectsGitChangesInStandardRepo(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())

	// Create a standard .git directory
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
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch(root)

	// Modify the index file
	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(gitDir, "index"), []byte("updated-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Wait for the debounced event
	select {
	case event := <-events:
		if event.Topic != "gitChanged" {
			t.Errorf("expected topic 'gitChanged', got %q", event.Topic)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for gitChanged event")
	}
}

func TestWorktreeWatcher_InvokesGitChangedCallback(t *testing.T) {
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
	watchers := newWorkspaceWatchers(hub, func(worktreePath string) {
		callbackPaths <- worktreePath
	})
	defer watchers.Close()

	watchers.Watch(root)
	time.Sleep(100 * time.Millisecond)

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
	root := evalSymlinks(t, t.TempDir())

	// Create a standard .git directory
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch(root)

	// Create a new file in the worktree root
	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(root, "newfile.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Wait for the debounced event
	select {
	case event := <-events:
		if event.Topic != "workspaceFilesChanged" {
			t.Errorf("expected topic 'workspaceFilesChanged', got %q", event.Topic)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for workspaceFilesChanged event")
	}
}

func TestWorktreeWatcher_DetectsFileChangesInSubdirectory(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())

	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "nested", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch(root)

	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(root, "nested", "deep", "child.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-events:
		if event.Topic != "workspaceFilesChanged" {
			t.Fatalf("expected topic 'workspaceFilesChanged', got %q", event.Topic)
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			t.Fatal("expected map payload")
		}
		paths, ok := payload["changedRelativePaths"].([]string)
		if !ok {
			t.Fatal("expected []string changedRelativePaths")
		}
		found := false
		for _, p := range paths {
			if p == "nested/deep/child.txt" {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected changed path nested/deep/child.txt, got %v", paths)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for workspaceFilesChanged event")
	}
}

func TestWorktreeWatcher_WatchesNewDirectoriesAndCleansDeletedDirectoryWatches(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())

	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch(root)

	entry := watchers.entries[root]
	if entry == nil {
		t.Fatal("expected watcher entry for root")
	}

	time.Sleep(100 * time.Millisecond)
	newDir := filepath.Join(root, "created", "sub")
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "file.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case <-events:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for file event from new directory")
	}

	entry.mu.Lock()
	_, watched := entry.watchedDirs[newDir]
	entry.mu.Unlock()
	if !watched {
		t.Fatalf("expected new directory %q to be watched", newDir)
	}

	if err := os.RemoveAll(filepath.Join(root, "created")); err != nil {
		t.Fatal(err)
	}

	time.Sleep(300 * time.Millisecond)

	entry.mu.Lock()
	_, stillWatched := entry.watchedDirs[newDir]
	entry.mu.Unlock()
	if stillWatched {
		t.Fatalf("expected deleted directory %q watch to be cleaned up", newDir)
	}
}

func TestWorktreeWatcher_ExcludesCommonLargeDirectories(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())

	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "dist"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "build"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	watchers.Watch(root)

	entry := watchers.entries[root]
	if entry == nil {
		t.Fatal("expected watcher entry for root")
	}

	entry.mu.Lock()
	_, nodeModulesWatched := entry.watchedDirs[filepath.Join(root, "node_modules")]
	_, distWatched := entry.watchedDirs[filepath.Join(root, "dist")]
	_, buildWatched := entry.watchedDirs[filepath.Join(root, "build")]
	entry.mu.Unlock()

	if nodeModulesWatched || distWatched || buildWatched {
		t.Fatalf("expected excluded directories to be unwatched, got node_modules=%t dist=%t build=%t", nodeModulesWatched, distWatched, buildWatched)
	}
}

func TestWorktreeWatcher_ExcludesGitIgnoredDirectories(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	initGitRepo(t, root)
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".cache/\nignored/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".cache"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "ignored", "nested"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	watchers.Watch(root)

	entry := watchers.entries[root]
	if entry == nil {
		t.Fatal("expected watcher entry for root")
	}

	entry.mu.Lock()
	_, cacheWatched := entry.watchedDirs[filepath.Join(root, ".cache")]
	_, ignoredWatched := entry.watchedDirs[filepath.Join(root, "ignored")]
	_, nestedIgnoredWatched := entry.watchedDirs[filepath.Join(root, "ignored", "nested")]
	entry.mu.Unlock()

	if cacheWatched || ignoredWatched || nestedIgnoredWatched {
		t.Fatalf(
			"expected gitignored directories to be unwatched, got .cache=%t ignored=%t ignored/nested=%t",
			cacheWatched,
			ignoredWatched,
			nestedIgnoredWatched,
		)
	}
}

func TestWorktreeWatcher_AlwaysWatchesMyContextEvenIfIgnored(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	initGitRepo(t, root)
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".my-context/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchers(hub, nil)
	defer watchers.Close()

	watchers.Watch(root)

	entry := watchers.entries[root]
	if entry == nil {
		t.Fatal("expected watcher entry for root")
	}

	entry.mu.Lock()
	_, contextWatched := entry.watchedDirs[filepath.Join(root, ".my-context")]
	entry.mu.Unlock()

	if !contextWatched {
		t.Fatalf("expected %q to always be watched", filepath.Join(root, ".my-context"))
	}
}
