package watchers

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"yishan/apps/cli/internal/git"
)

type ignoreClassifier interface {
	classifyGitIgnoredPaths(context.Context, []string) (map[string]bool, error)
}

func newIgnoreTestWatcher(t *testing.T) *worktreeWatcher {
	t.Helper()
	root := t.TempDir()
	cmd := exec.Command("git", "init", root)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %s: %v", output, err)
	}
	return &worktreeWatcher{path: root, ignoredPaths: make(map[string]bool), gitService: git.NewGitService()}
}

func TestGitIgnore_TrackedDescendantAndFilenameSemantics(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	if err := os.Mkdir(filepath.Join(w.path, "ignored"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(w.path, "ignored/tracked"), nil, 0644); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("ignored/\n*special*\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if !w.isGitIgnoredPath("ignored") {
		t.Fatal("parent should be ignored")
	}
	if output, err := exec.Command("git", "-C", w.path, "add", "-f", "ignored/tracked").CombinedOutput(); err != nil {
		t.Fatalf("add: %s: %v", output, err)
	}
	if w.isGitIgnoredPath("ignored/tracked") {
		t.Error("tracked child hidden by cached ancestor")
	}
	for _, path := range []string{"-special", " special ", "special\nfile"} {
		if !w.isGitIgnoredPath(path) {
			t.Errorf("ignored filename %q was lost", path)
		}
	}
}

func TestGitIgnore_BatchContract(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	classifier, ok := any(w).(ignoreClassifier)
	if !ok {
		t.Fatal("watcher lacks context-aware batch classification")
	}
	paths, err := classifier.classifyGitIgnoredPaths(context.Background(), []string{"visible", "visible"})
	if err != nil || len(paths) != 1 || paths["visible"] {
		t.Fatalf("classification: %v, %v", paths, err)
	}
}

// The seam counts command construction separately from Git's filename parsing.
func countIgnoreCommands(w *worktreeWatcher) (*atomic.Int32, *atomic.Int32) {
	readiness, checks := new(atomic.Int32), new(atomic.Int32)
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if args[2] == "rev-parse" {
			readiness.Add(1)
		} else {
			checks.Add(1)
		}
		return defaultGitCommand(ctx, args...)
	})
	return readiness, checks
}

func TestGitIgnore_CountsChunksAndExactCache(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	readiness, checks := countIgnoreCommands(w)
	if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("*ignored*\n"), 0644); err != nil {
		t.Fatal(err)
	}
	paths := []string{"-ignored", " ignored ", "ignored\nfile", "visible"}
	for index := 0; index < gitIgnoreBatchSize*2; index++ {
		paths = append(paths, fmt.Sprintf("file-%d", index))
	}
	paths = append(paths, paths...)
	matches, err := w.classifyGitIgnoredPaths(context.Background(), paths)
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range paths {
		if matches[path] != strings.Contains(path, "ignored") {
			t.Errorf("wrong match for %q", path)
		}
	}
	if readiness.Load() != 1 || checks.Load() != 3 {
		t.Fatalf("readiness=%d checks=%d", readiness.Load(), checks.Load())
	}
	for _, path := range paths {
		if w.isGitIgnoredPath(path) != matches[path] {
			t.Fatalf("cache %q", path)
		}
	}
	if readiness.Load() != 1 || checks.Load() != 3 {
		t.Fatal("exact positive/negative hits launched commands")
	}
}

func TestGitIgnore_TransientFailuresRetryWithoutCaching(t *testing.T) {
	for _, phase := range []string{"rev-parse", "check-ignore"} {
		t.Run(phase, func(t *testing.T) {
			w := newIgnoreTestWatcher(t)
			var failures atomic.Int32
			installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
				if args[2] == phase && failures.Add(1) == 1 {
					return defaultGitCommand(ctx, "-C", filepath.Join(w.path, "missing"), "status")
				}
				return defaultGitCommand(ctx, args...)
			})
			if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("ignored\n"), 0644); err != nil {
				t.Fatal(err)
			}
			if w.isGitIgnoredPath("ignored") {
				t.Fatal("failure must fail open")
			}
			if failures.Load() != 1 {
				t.Fatal("failure retried inside synchronous call")
			}
			if !w.isGitIgnoredPath("ignored") {
				t.Fatal("transient failure permanently cached")
			}
		})
	}
}

func TestGitIgnore_InvalidationFencesReadinessAndSynchronousResults(t *testing.T) {
	for _, phase := range []string{"rev-parse", "check-ignore"} {
		t.Run(phase, func(t *testing.T) {
			w := newIgnoreTestWatcher(t)
			if err := os.WriteFile(filepath.Join(w.path, ".gitignore"), []byte("ignored\n"), 0644); err != nil {
				t.Fatal(err)
			}
			entered, release := make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
				if args[2] == phase && calls.Add(1) == 1 {
					close(entered)
					select {
					case <-release:
					case <-ctx.Done():
					}
				}
				return defaultGitCommand(ctx, args...)
			})
			result := make(chan bool, 1)
			go func() { result <- w.isGitIgnoredPath("ignored") }()
			<-entered
			w.clearIgnoreCacheIfNeeded(filepath.Join(w.path, ".gitignore"))
			close(release)
			if <-result {
				t.Fatal("stale generation escaped synchronous caller")
			}
			if !w.isGitIgnoredPath("ignored") {
				t.Fatal("fresh generation failed")
			}
			if calls.Load() != 2 {
				t.Fatalf("stale %s cache reused, calls=%d", phase, calls.Load())
			}
		})
	}
}

func TestGitIgnore_CancellationAndDeadlineAreRetryable(t *testing.T) {
	for _, phase := range []string{"rev-parse", "check-ignore"} {
		t.Run(phase, func(t *testing.T) {
			w := newIgnoreTestWatcher(t)
			entered := make(chan struct{})
			ctx, cancel := context.WithCancel(context.Background())
			installGitCommand(w, func(commandCtx context.Context, args ...string) (*exec.Cmd, bool) {
				if _, ok := commandCtx.Deadline(); !ok {
					t.Error("unbounded Git command")
				}
				if args[2] == phase {
					close(entered)
					<-commandCtx.Done()
				}
				return defaultGitCommand(commandCtx, args...)
			})
			result := make(chan error, 1)
			go func() { _, err := w.classifyGitIgnoredPaths(ctx, []string{"visible"}); result <- err }()
			<-entered
			cancel()
			if err := <-result; !errors.Is(err, context.Canceled) {
				t.Fatalf("cancellation: %v", err)
			}
			readiness, checks := countIgnoreCommands(w)
			if _, err := w.classifyGitIgnoredPaths(context.Background(), []string{"visible"}); err != nil {
				t.Fatal(err)
			}
			if checks.Load() != 1 || (phase == "rev-parse" && readiness.Load() != 1) {
				t.Fatal("cancellation cached a result")
			}
		})
	}
}

func TestGitIgnore_ConcurrentReadinessIsShared(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	entered, release := make(chan struct{}), make(chan struct{})
	var probes atomic.Int32
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if args[2] == "rev-parse" {
			if probes.Add(1) == 1 {
				close(entered)
			}
			select {
			case <-release:
			case <-ctx.Done():
			}
		}
		return defaultGitCommand(ctx, args...)
	})
	var group sync.WaitGroup
	for index := 0; index < 8; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := w.classifyGitIgnoredPaths(context.Background(), []string{"visible"}); err != nil {
				t.Error(err)
			}
		}()
	}
	<-entered
	close(release)
	group.Wait()
	if probes.Load() != 1 {
		t.Fatalf("duplicate readiness probes: %d", probes.Load())
	}
}
