package watchers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func newIngressWatcher(t *testing.T) (*worktreeWatcher, *eventHub) {
	t.Helper()
	w := newIgnoreTestWatcher(t)
	w.resolvedGitDir = ResolveGitDir(w.path)
	hub := newEventHub()
	w.sink = eventHubWatcherSink{events: hub}
	w.done = make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	w.gitContext = ctx
	w.gitCancel = cancel
	t.Cleanup(func() { w.close(); cancel() })
	return w, hub
}

func ingressBurst(w *worktreeWatcher, path string, count int) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < count; i++ {
			w.handleChangedPath(filepath.Join(w.path, path))
		}
	}()
	return done
}

func awaitIngress(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("ordinary ingress blocked on Git")
	}
}

func TestIngress_DeduplicatesPendingAndInflightRetainsArrivals(t *testing.T) {
	w, hub := newIngressWatcher(t)
	entered, release := make(chan struct{}), make(chan struct{})
	defer close(release)
	var checks, active, peak atomic.Int32
	installIngressGate(w, entered, release, &checks, &active, &peak)
	awaitIngress(t, ingressBurst(w, "first", 100))
	awaitIngress(t, entered)
	awaitIngress(t, ingressBurst(w, "first", 100))
	awaitIngress(t, ingressBurst(w, "second", 100))
	release <- struct{}{}
	seen := map[string]bool{}
	for len(seen) < 2 {
		event := expectEventTopic(t, hub.events, "workspaceFilesChanged")
		for _, path := range event.Payload.(map[string]any)["changedRelativePaths"].([]string) {
			seen[path] = true
		}
	}
	if checks.Load() != 2 || peak.Load() != 1 {
		t.Fatalf("checks=%d peak=%d", checks.Load(), peak.Load())
	}
}

func TestIngress_InvalidationRevalidatesInflightAndCache(t *testing.T) {
	w, hub := newIngressWatcher(t)
	if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("hidden\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if !w.isGitIgnoredPath("hidden") {
		t.Fatal("expected ignored cache")
	}
	entered, release := make(chan struct{}), make(chan struct{})
	defer close(release)
	var checks atomic.Int32
	installInvalidationGate(w, entered, release, &checks)
	awaitIngress(t, ingressBurst(w, "other", 1))
	awaitIngress(t, entered)
	awaitIngress(t, ingressBurst(w, "hidden", 1))
	if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), nil, 0644); err != nil {
		t.Fatal(err)
	}
	awaitIngress(t, ingressBurst(w, ".gitignore", 1))
	release <- struct{}{}
	for {
		event := expectEventTopic(t, hub.events, "workspaceFilesChanged")
		paths := event.Payload.(map[string]any)["changedRelativePaths"].([]string)
		if len(paths) == 0 || containsPath(paths, "hidden") {
			break
		}
	}
}

func TestIngress_ContinuousInputPublishesBeforeInputStops(t *testing.T) {
	w, hub := newIngressWatcher(t)
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				w.handleChangedPath(filepath.Join(w.path, "visible"))
			}
		}
	}()
	for i := 0; i < 3; i++ {
		expectEventTopic(t, hub.events, "workspaceFilesChanged")
	}
}

func TestIngress_CloseCancelsActualCommandAndPreventsNotifications(t *testing.T) {
	w, hub := newIngressWatcher(t)
	entered, exited := make(chan struct{}), make(chan struct{})
	installCancellationCommand(t, w, entered, exited)
	awaitIngress(t, ingressBurst(w, "visible", 1))
	awaitIngress(t, entered)
	w.close()
	awaitIngress(t, exited)
	awaitIngress(t, ingressBurst(w, "late", 1))
	w.scheduleGitEmit(true)
	expectNoEvent(t, hub.events, watcherDebounce*2)
}

func installIngressGate(w *worktreeWatcher, entered chan struct{}, release <-chan struct{}, checks, active, peak *atomic.Int32) {
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if args[2] == "check-ignore" {
			n := active.Add(1)
			defer active.Add(-1)
			if n > peak.Load() {
				peak.Store(n)
			}
			if checks.Add(1) == 1 {
				close(entered)
				select {
				case <-release:
				case <-ctx.Done():
				}
			}
		}
		return defaultGitCommand(ctx, args...)
	})
}

func installInvalidationGate(w *worktreeWatcher, entered chan struct{}, release <-chan struct{}, checks *atomic.Int32) {
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if args[2] == "check-ignore" && checks.Add(1) == 1 {
			close(entered)
			select {
			case <-release:
			case <-ctx.Done():
			}
		}
		return defaultGitCommand(ctx, args...)
	})
}

func installCancellationCommand(t *testing.T, w *worktreeWatcher, entered, exited chan struct{}) {
	t.Helper()
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if _, ok := ctx.Deadline(); !ok {
			t.Error("missing command deadline")
		}
		if args[2] == "check-ignore" {
			marker := filepath.Join(w.path, "command-ready")
			cmd := exec.CommandContext(ctx, "sh", "-c", "echo ready > \"$1\"; exec sleep 30", "sh", marker)
			go func() {
				defer close(exited)
				for {
					if _, err := os.Stat(marker); err == nil {
						close(entered)
						return
					}
					select {
					case <-ctx.Done():
						return
					case <-time.After(time.Millisecond):
					}
				}
			}()
			return cmd, true
		}
		return defaultGitCommand(ctx, args...)
	})
}
