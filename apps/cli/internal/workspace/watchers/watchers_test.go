package watchers

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type frontendEvent struct {
	Topic   string
	Payload any
}

type eventHub struct {
	events chan frontendEvent
}

func newEventHub() *eventHub {
	return &eventHub{events: make(chan frontendEvent, 128)}
}

func (h *eventHub) Publish(event frontendEvent) {
	h.events <- event
}

func (h *eventHub) Subscribe() (uint64, <-chan frontendEvent) {
	return 1, h.events
}

func (h *eventHub) Unsubscribe(_ uint64) {}

type eventHubWatcherSink struct {
	events *eventHub
}

func (s eventHubWatcherSink) PublishWorkspaceFilesChanged(event FilesChangedEvent) {
	if s.events == nil {
		return
	}
	s.events.Publish(frontendEvent{
		Topic: "workspaceFilesChanged",
		Payload: map[string]any{
			"workspaceId":           event.WorkspaceID,
			"workspaceWorktreePath": event.WorktreePath,
			"changedRelativePaths":  event.ChangedRelativePaths,
		},
	})
}

func (s eventHubWatcherSink) PublishGitChanged(event GitChangedEvent) {
	if s.events == nil {
		return
	}
	payload := map[string]any{
		"workspaceId":           event.WorkspaceID,
		"workspaceWorktreePath": event.WorktreePath,
		"affectsBranch":         event.AffectsBranch,
	}
	if event.CurrentBranch != "" {
		payload["currentBranch"] = event.CurrentBranch
	}
	s.events.Publish(frontendEvent{Topic: "gitChanged", Payload: payload})
}

func newWorkspaceWatchersForEventHub(events *eventHub, onGitChanged func(worktreePath string)) *Watchers {
	return New(eventHubWatcherSink{events: events}, onGitChanged)
}

func resolveGitDir(worktreePath string) string {
	return ResolveGitDir(worktreePath)
}

func initGitRepo(t *testing.T, root string) {
	t.Helper()
	cmd := exec.Command("git", "init", root)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init failed: %v (%s)", err, string(output))
	}
}

func expectEventTopic(t *testing.T, events <-chan frontendEvent, wantTopic string) frontendEvent {
	t.Helper()
	deadline := time.After(3 * time.Second)

	for {
		select {
		case event := <-events:
			if event.Topic == wantTopic {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s event", wantTopic)
		}
	}
}

func expectNoEvent(t *testing.T, events <-chan frontendEvent, wait time.Duration) {
	t.Helper()

	select {
	case event := <-events:
		t.Fatalf("expected no event, got topic %q", event.Topic)
	case <-time.After(wait):
	}
}

func drainEvents(events <-chan frontendEvent, wait time.Duration) {
	timer := time.NewTimer(wait)
	defer timer.Stop()

	for {
		select {
		case <-events:
		case <-timer.C:
			return
		}
	}
}

func expectChangedPath(t *testing.T, event frontendEvent, wantPath string) {
	t.Helper()
	expectChangedPathInSet(t, event, []string{wantPath})
}

func expectChangedPathInSet(t *testing.T, event frontendEvent, wantPaths []string) {
	t.Helper()

	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatal("expected map payload")
	}
	paths, ok := payload["changedRelativePaths"].([]string)
	if !ok {
		t.Fatal("expected []string changedRelativePaths")
	}
	for _, wantPath := range wantPaths {
		if containsPath(paths, wantPath) {
			return
		}
	}
	t.Fatalf("expected one of changed paths %v, got %v", wantPaths, paths)
}

func containsPath(paths []string, want string) bool {
	for _, path := range paths {
		if path == want {
			return true
		}
	}
	return false
}

func containsPathWithSuffix(paths []string, suffix string) bool {
	for _, path := range paths {
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}

func evalSymlinks(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func skipDarwinWatcherIntegrationTest(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "darwin" {
		t.Skip("darwin fsevents integration is covered by internal/fswatch unit tests; daemon-level watcher integration tests are flaky on macOS")
	}
}

func writeUntilEvent(filePath string, content string, interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		_ = os.WriteFile(filePath, []byte(content), 0o644)
		select {
		case <-stop:
			return
		case <-ticker.C:
		}
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
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "HEAD"), []byte("ref: refs/heads/my-branch\n"), 0o644); err != nil {
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

	resolved := resolveGitDir(worktreeDir)
	if resolved != actualGitDir {
		t.Errorf("expected %q, got %q", actualGitDir, resolved)
	}
}

func TestResolveGitDir_WorktreeFileRelativePath(t *testing.T) {
	root := t.TempDir()
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	worktreeDir := filepath.Join(root, "main-repo", "worktrees", "my-worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
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
	if err := os.WriteFile(filepath.Join(root, ".git"), []byte("some-random-content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(root)
	expected := filepath.Join(root, ".git")
	if resolved != expected {
		t.Errorf("expected %q, got %q", expected, resolved)
	}
}

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
