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

type eventHub struct {
	events chan frontendEvent
}

type frontendEvent struct {
	Topic   string
	Payload any
}
