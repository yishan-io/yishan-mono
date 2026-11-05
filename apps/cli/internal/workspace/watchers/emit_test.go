package watchers

import (
	"context"
	"encoding/json"
	"os/exec"
	"strconv"
	"testing"
	"time"
)

func TestBoundChangedPaths_OverflowSignalsFullRefresh(t *testing.T) {
	paths := make([]string, maxChangedPathsPerEvent+1)
	for index := range paths {
		paths[index] = "src/file-" + strconv.Itoa(index)
	}

	got := boundChangedPaths(paths)
	if got == nil || len(got) != 0 {
		t.Fatalf("boundChangedPaths() = %#v, want non-nil empty full-refresh signal", got)
	}
}

func TestBoundChangedPaths_OverflowSerializesAsEmptyArray(t *testing.T) {
	paths := make([]string, maxChangedPathsPerEvent+1)
	for index := range paths {
		paths[index] = "src/file-" + strconv.Itoa(index)
	}

	encoded, err := json.Marshal(struct {
		ChangedRelativePaths []string `json:"changedRelativePaths"`
	}{
		ChangedRelativePaths: boundChangedPaths(paths),
	})
	if err != nil {
		t.Fatalf("marshal overflow signal: %v", err)
	}

	if string(encoded) != `{"changedRelativePaths":[]}` {
		t.Fatalf("overflow signal JSON = %s, want empty array", encoded)
	}
}

func TestWorktreeWatcher_FileBurstOverflowSendsFullRefreshSignal(t *testing.T) {
	hub := newEventHub()
	watcher := &worktreeWatcher{
		workspaceID: "workspace-1",
		path:        t.TempDir(),
		sink:        eventHubWatcherSink{events: hub},
	}

	for index := 0; index <= maxChangedPathsPerEvent; index++ {
		watcher.scheduleFileEmit("src/file-" + strconv.Itoa(index))
	}

	event := expectEventTopic(t, hub.events, "workspaceFilesChanged")
	payload := event.Payload.(map[string]any)
	changedPaths := payload["changedRelativePaths"].([]string)
	if changedPaths == nil || len(changedPaths) != 0 {
		t.Fatalf("changedRelativePaths = %#v, want non-nil empty full-refresh signal", changedPaths)
	}
}

func TestWorktreeWatcher_ScheduleFileEmitSkipsMissingWorktree(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		invalidate func(*testing.T, string)
	}{
		{name: "missing", invalidate: removeWorktree},
		{name: "non-directory", invalidate: replaceWorktreeWithFile},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			worktreePath := t.TempDir()
			hub := newEventHub()
			watcher := &worktreeWatcher{
				workspaceID: "workspace-1",
				path:        worktreePath,
				sink:        eventHubWatcherSink{events: hub},
			}

			watcher.scheduleFileEmit("src/file.go")
			testCase.invalidate(t, worktreePath)

			expectNoEvent(t, hub.events, watcherDebounce+100*time.Millisecond)
		})
	}
}

func TestWorktreeWatcher_ScheduleGitEmitSkipsMissingWorktree(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		invalidate func(*testing.T, string)
	}{
		{name: "missing", invalidate: removeWorktree},
		{name: "non-directory", invalidate: replaceWorktreeWithFile},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			worktreePath := t.TempDir()
			callbackPaths := make(chan string, 1)
			hub := newEventHub()
			watcher := &worktreeWatcher{
				workspaceID: "workspace-1",
				path:        worktreePath,
				sink:        eventHubWatcherSink{events: hub},
				onGitChanged: func(path string) {
					callbackPaths <- path
				},
			}

			watcher.scheduleGitEmit(true)
			testCase.invalidate(t, worktreePath)

			expectNoEvent(t, hub.events, watcherDebounce+100*time.Millisecond)
			select {
			case path := <-callbackPaths:
				t.Fatalf("unexpected git callback for %q", path)
			default:
			}
		})
	}
}

func TestWorktreeWatcher_NotifyGitChangedSkipsMissingWorktree(t *testing.T) {
	worktreePath := t.TempDir()
	callbackPaths := make(chan string, 1)
	watcher := &worktreeWatcher{
		path: worktreePath,
		onGitChanged: func(path string) {
			callbackPaths <- path
		},
	}

	removeWorktree(t, worktreePath)
	watcher.notifyGitChanged()

	select {
	case path := <-callbackPaths:
		t.Fatalf("unexpected git callback for %q", path)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestBoundChangedPaths_KeepsSmallBatches(t *testing.T) {
	paths := []string{"src/a.ts", "src/b.ts"}

	got := boundChangedPaths(paths)
	if len(got) != len(paths) {
		t.Fatalf("boundChangedPaths() = %d paths, want %d", len(got), len(paths))
	}
}

// Exercise the delegated branch operation with real Git, including detached HEAD.
func TestReadCurrentBranch_HeadNameAndErrors(t *testing.T) {
	w := newIgnoreTestWatcher(t)
	args := []string{"-C", w.path, "-c", "user.name=Watcher Test", "-c", "user.email=watcher@example.test", "commit", "--allow-empty", "-m", "initial"}
	if out, err := exec.Command("git", args...).CombinedOutput(); err != nil {
		t.Fatalf("commit: %s: %v", out, err)
	}
	if out, err := exec.Command("git", "-C", w.path, "checkout", "-b", "watcher-branch").CombinedOutput(); err != nil {
		t.Fatalf("checkout: %s: %v", out, err)
	}
	if branch := w.readCurrentBranch(); branch != "watcher-branch" {
		t.Fatalf("branch = %q", branch)
	}
	if out, err := exec.Command("git", "-C", w.path, "checkout", "--detach").CombinedOutput(); err != nil {
		t.Fatalf("detach: %s: %v", out, err)
	}
	if branch := w.readCurrentBranch(); branch != "HEAD" {
		t.Fatalf("detached branch = %q", branch)
	}
	w.path = t.TempDir()
	if branch := w.readCurrentBranch(); branch != "" {
		t.Fatalf("non-worktree branch = %q", branch)
	}
}

func TestReadCurrentBranch_BoundedContext(t *testing.T) {
	for _, shouldCancel := range []bool{false, true} {
		w := newIgnoreTestWatcher(t)
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		w.gitContext = ctx
		if shouldCancel {
			cancel()
		}
		installGitCommand(w, func(commandCtx context.Context, args ...string) (*exec.Cmd, bool) {
			if deadline, ok := commandCtx.Deadline(); !ok || time.Until(deadline) > gitIgnoreCommandTimeout {
				t.Error("unbounded branch lookup")
			}
			<-commandCtx.Done()
			return defaultGitCommand(commandCtx, args...)
		})
		if branch := w.readCurrentBranch(); branch != "" || ctx.Err() == nil {
			t.Errorf("branch=%q context error=%v", branch, ctx.Err())
		}
		cancel()
	}
}
