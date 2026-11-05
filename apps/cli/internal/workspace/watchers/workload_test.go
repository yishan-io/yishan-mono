package watchers

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

const workloadDistinctPaths = 257

// This workload measures only ignore classification commands, not Git setup,
// branch reads, or synchronous watcher discovery.
func TestWorkload_Cold257AndExactWarmRerun(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("hidden-*\n"), 0644); err != nil {
		t.Fatal(err)
	}
	paths := makeWorkloadPaths()
	readiness, checks := countIgnoreCommands(w)
	captures := captureWorkloadBatches(t, w, checks)
	assertWorkloadClassification(t, w, paths)
	assertWorkloadCounts(t, "cold", readiness.Load(), checks.Load(), 1, 3)
	assertWorkloadBatches(t, captures, paths)
	t.Logf("cold input=257 distinct=257 readiness=1 check-ignore=3 total=4 batches=[128 128 1] old-per-miss-check-ignore=257")
	beforeReadiness, beforeChecks := readiness.Load(), checks.Load()
	assertWorkloadClassification(t, w, paths)
	assertWorkloadCounts(t, "exact warm", readiness.Load()-beforeReadiness, checks.Load()-beforeChecks, 0, 0)
	t.Log("exact warm input=257 distinct=257 readiness=0 check-ignore=0 total=0")
}

func makeWorkloadPaths() []string {
	paths := make([]string, workloadDistinctPaths)
	for index := range paths {
		prefix := "visible"
		if index%2 == 0 {
			prefix = "hidden"
		}
		paths[index] = fmt.Sprintf("%s-%03d", prefix, index)
	}
	return paths
}

func assertWorkloadClassification(t *testing.T, w *worktreeWatcher, paths []string) {
	t.Helper()
	matches, err := w.classifyGitIgnoredPaths(context.Background(), paths)
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != len(paths) {
		t.Fatalf("classified %d paths, want %d", len(matches), len(paths))
	}
	for index, path := range paths {
		if isIgnored, exists := matches[path]; !exists || isIgnored != (index%2 == 0) {
			t.Fatalf("classification %q: exists=%v ignored=%v", path, exists, isIgnored)
		}
	}
}

// Capture actual NUL-delimited stdin, then pass it unchanged to real Git.
// Wrapping the existing counting seam preserves its command accounting.
func captureWorkloadBatches(t *testing.T, w *worktreeWatcher, checks *atomic.Int32) string {
	t.Helper()
	captures := t.TempDir()
	counted := w.gitService.(*watcherTestGit).command
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		command, ok := counted(ctx, args...)
		if !ok || args[2] != "check-ignore" {
			return command, ok
		}
		capture := filepath.Join(captures, fmt.Sprintf("batch-%d", checks.Load()))
		shellArgs := []string{"-c", `capture=$1; shift; tee "$capture" | "$@"`, "workload", capture, command.Path}
		shellArgs = append(shellArgs, command.Args[1:]...)
		wrapped := exec.CommandContext(ctx, "sh", shellArgs...)
		wrapped.Dir, wrapped.Env = command.Dir, command.Env
		return wrapped, true
	})
	return captures
}

func assertWorkloadBatches(t *testing.T, captures string, paths []string) {
	t.Helper()
	sizes := []int{128, 128, 1}
	offset := 0
	for index, size := range sizes {
		payload, err := os.ReadFile(filepath.Join(captures, fmt.Sprintf("batch-%d", index+1)))
		if err != nil {
			t.Fatal(err)
		}
		entries := bytes.Split(payload, []byte{0})
		if len(entries) != size+1 || len(entries[size]) != 0 {
			t.Fatalf("batch %d: want %d NUL-terminated paths, got %q", index+1, size, payload)
		}
		for entry, path := range paths[offset : offset+size] {
			if string(entries[entry]) != path {
				t.Fatalf("batch %d entry %d: got %q want %q", index+1, entry, entries[entry], path)
			}
		}
		offset += size
	}
}

func assertWorkloadCounts(t *testing.T, phase string, readiness, checks, wantReadiness, wantChecks int32) {
	t.Helper()
	if readiness != wantReadiness || checks != wantChecks || readiness+checks != wantReadiness+wantChecks {
		t.Fatalf("%s readiness=%d check-ignore=%d total=%d; want %d/%d/%d", phase,
			readiness, checks, readiness+checks, wantReadiness, wantChecks, wantReadiness+wantChecks)
	}
}

func TestWorkload_RepeatedIngressRetainsArrivals(t *testing.T) {
	const repeatsPerPath = 500
	w, hub := newIngressWatcher(t)
	entered, release := make(chan struct{}), make(chan struct{})
	defer close(release)
	var readiness, checks, active, peak atomic.Int32
	installIngressGate(w, entered, release, &checks, &active, &peak)
	classificationPeak := observeWorkloadClassifications(w, &readiness)
	awaitIngress(t, ingressBurst(w, "first", 1))
	awaitIngress(t, entered)
	// The first path is inflight. The second remains pending behind its gate;
	// duplicates of both must be suppressed while the new arrival is retained.
	awaitIngress(t, ingressBurst(w, "first", repeatsPerPath-1))
	awaitIngress(t, ingressBurst(w, "second", repeatsPerPath))
	if checks.Load() != 1 || peak.Load() != 1 {
		t.Fatalf("blocked classification: checks=%d peak=%d", checks.Load(), peak.Load())
	}
	release <- struct{}{}
	assertWorkloadArrivals(t, hub)
	assertWorkloadCounts(t, "repeated ingress", readiness.Load(), checks.Load(), 1, 2)
	if peak.Load() != 1 || classificationPeak.Load() != 1 {
		t.Fatalf("peak async classifications=%d command constructors=%d, want 1/workspace", classificationPeak.Load(), peak.Load())
	}
	t.Logf("repeated input=%d distinct=2 (500/path) readiness=1 check-ignore=2 total=3 peak-async=1/workspace; pending+inflight duplicates suppressed, new arrival retained",
		repeatsPerPath*2)
}

// Each classification owns a context canceled on return. Count live contexts at
// every command boundary, including attempts to overlap the blocked first batch.
func observeWorkloadClassifications(w *worktreeWatcher, readiness *atomic.Int32) *atomic.Int32 {
	gated := w.gitService.(*watcherTestGit).command
	var mu sync.Mutex
	contexts := make(map[context.Context]bool)
	peak := new(atomic.Int32)
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		mu.Lock()
		for previous := range contexts {
			if previous.Err() != nil {
				delete(contexts, previous)
			}
		}
		contexts[ctx] = true
		if live := int32(len(contexts)); live > peak.Load() {
			peak.Store(live)
		}
		mu.Unlock()
		if args[2] == "rev-parse" && args[3] == "--is-inside-work-tree" {
			readiness.Add(1)
		}
		return gated(ctx, args...)
	})
	return peak
}

func assertWorkloadArrivals(t *testing.T, hub *eventHub) {
	t.Helper()
	seen := make(map[string]bool)
	for len(seen) < 2 {
		event := expectEventTopic(t, hub.events, "workspaceFilesChanged")
		paths := event.Payload.(map[string]any)["changedRelativePaths"].([]string)
		if len(paths) == 0 {
			t.Fatal("unexpected full refresh instead of exact arrivals")
		}
		for _, path := range paths {
			if (path != "first" && path != "second") || seen[path] {
				t.Fatalf("unexpected or duplicate arrival %q", path)
			}
			seen[path] = true
		}
	}
	expectNoEvent(t, hub.events, watcherDebounce*2)
}
