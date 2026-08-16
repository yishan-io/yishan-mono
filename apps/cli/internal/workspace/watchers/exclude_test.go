package watchers

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWorktreeWatcher_ExcludesCommonLargeDirectories(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

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
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	if err := os.WriteFile(filepath.Join(root, "node_modules", "pkg.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "dist", "out.js"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "build", "out.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	expectNoEvent(t, events, 500*time.Millisecond)
}

func TestWorktreeWatcher_ExcludesGitIgnoredDirectories(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

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
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	subID, events := hub.Subscribe()
	defer hub.Unsubscribe(subID)

	watchers.Watch("ws-test", root)
	time.Sleep(100 * time.Millisecond)
	drainEvents(events, 300*time.Millisecond)

	if err := os.WriteFile(filepath.Join(root, ".cache", "tmp.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "ignored", "nested", "tmp.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	expectNoEvent(t, events, 500*time.Millisecond)
}

func TestWorktreeWatcher_AlwaysWatchesMyContextEvenIfIgnored(t *testing.T) {
	skipDarwinWatcherIntegrationTest(t)

	root := evalSymlinks(t, t.TempDir())
	initGitRepo(t, root)
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".my-context/\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".my-context"), 0o755); err != nil {
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

	contextFile := filepath.Join(root, ".my-context", "notes.md")
	stopWrites := make(chan struct{})
	go writeUntilEvent(contextFile, "hello", 250*time.Millisecond, stopWrites)

	event := expectEventTopic(t, events, "workspaceFilesChanged")
	close(stopWrites)
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatal("expected map payload")
	}
	paths, ok := payload["changedRelativePaths"].([]string)
	if !ok {
		t.Fatal("expected []string changedRelativePaths")
	}
	if !containsPathWithSuffix(paths, ".my-context/notes.md") && !containsPath(paths, ".my-context") {
		t.Fatalf("expected .my-context or .my-context/notes.md in changed paths, got %v", paths)
	}
}

func TestWorkspaceWatchers_ReusesSharedContextWatchers(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	contextDir := filepath.Join(root, "shared-context")
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		t.Fatal(err)
	}

	workspaceOne := filepath.Join(root, "workspace-one")
	workspaceTwo := filepath.Join(root, "workspace-two")
	for _, workspacePath := range []string{workspaceOne, workspaceTwo} {
		if err := os.MkdirAll(filepath.Join(workspacePath, ".git"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(contextDir, filepath.Join(workspacePath, ".my-context")); err != nil {
			t.Fatal(err)
		}
	}

	hub := newEventHub()
	watchers := newWorkspaceWatchersForEventHub(hub, nil)
	defer watchers.Close()

	watchers.Watch(workspaceOne, workspaceOne)
	watchers.Watch(workspaceTwo, workspaceTwo)

	registration, ok := watchers.contexts[contextDir]
	if !ok {
		t.Fatal("expected shared context watcher registration")
	}
	if len(watchers.contexts) != 1 {
		t.Fatalf("expected 1 shared context watcher, got %d", len(watchers.contexts))
	}
	if len(registration.workspacePaths) != 2 {
		t.Fatalf("expected 2 workspace subscribers, got %d", len(registration.workspacePaths))
	}

	watchers.Unwatch(workspaceOne)
	registration, ok = watchers.contexts[contextDir]
	if !ok {
		t.Fatal("expected shared context watcher to remain after removing one workspace")
	}
	if len(registration.workspacePaths) != 1 {
		t.Fatalf("expected 1 remaining workspace subscriber, got %d", len(registration.workspacePaths))
	}

	watchers.Unwatch(workspaceTwo)
	if len(watchers.contexts) != 0 {
		t.Fatalf("expected shared context watchers to be cleaned up, got %d", len(watchers.contexts))
	}
}

func TestWorktreeWatcher_HasCachedIgnoredAncestor(t *testing.T) {
	watcher := &worktreeWatcher{
		ignoredPaths: map[string]bool{
			"ignored":             true,
			"ignored/known-false": false,
		},
	}

	if !watcher.hasCachedIgnoredAncestor("ignored/nested/file.txt") {
		t.Fatal("expected ignored ancestor to be detected")
	}
	if watcher.hasCachedIgnoredAncestor("tracked/nested/file.txt") {
		t.Fatal("did not expect unrelated path to have ignored ancestor")
	}
	if watcher.hasCachedIgnoredAncestor("ignored") {
		t.Fatal("did not expect exact path lookup to count as ancestor")
	}
}
