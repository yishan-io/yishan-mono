package watchers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type lifecycleSink struct{ file, git func() }

func (s lifecycleSink) PublishWorkspaceFilesChanged(FilesChangedEvent) {
	if s.file != nil {
		s.file()
	}
}
func (s lifecycleSink) PublishGitChanged(GitChangedEvent) {
	if s.git != nil {
		s.git()
	}
}

func awaitLifecycle(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("lifecycle milestone timed out")
	}
}
func startLifecycle(fn func()) <-chan struct{} {
	done := make(chan struct{})
	go func() { defer close(done); fn() }()
	return done
}
func requireDraining(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
		t.Error("shutdown returned before notification completed")
	default:
	}
}

// The returned milestone is checked at shutdown return, not after a sleep.
func startGuardedLifecycle(t *testing.T, fn func(), completed *atomic.Bool) <-chan struct{} {
	t.Helper()
	return startLifecycle(func() {
		fn()
		if !completed.Load() {
			t.Error("lifecycle returned before gated sequence completed")
		}
	})
}

// Observe the specific caller parked inside the real join, not merely launched
// or paused in a pre-join hook. Gosched is only a yield; the stack is the proof.
func startJoinedLifecycle(t *testing.T, fn func(), completed *atomic.Bool) (<-chan struct{}, string) {
	t.Helper()
	identity := make(chan string, 1)
	done := startGuardedLifecycle(t, func() {
		stack := make([]byte, 1024)
		n := runtime.Stack(stack, false)
		identity <- "goroutine " + strings.Fields(string(stack[:n]))[1] + " "
		fn()
	}, completed)
	return done, <-identity
}

func awaitLifecycleJoin(t *testing.T, done <-chan struct{}, identity string) {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	for {
		stack := make([]byte, 1<<20)
		n := runtime.Stack(stack, true)
		for caller := range strings.SplitSeq(string(stack[:n]), "\n\n") {
			if !strings.HasPrefix(caller, identity) {
				continue
			}
			isParked := strings.Contains(caller, "[semacquire]") || strings.Contains(caller, "[sync.Mutex.Lock]") ||
				strings.Contains(caller, "[sync.WaitGroup.Wait]") || strings.Contains(caller, "[chan receive]")
			isJoin := strings.Contains(caller, "sync.(*WaitGroup).Wait(") ||
				strings.Contains(caller, "sync.(*Once).doSlow(") || strings.Contains(caller, "(*Watchers).Watch(")
			if isParked && isJoin {
				return
			}
		}
		select {
		case <-done:
			t.Fatal("lifecycle returned without reaching blocked join")
		case <-deadline.C:
			t.Fatal("caller did not reach blocked join")
		default:
			runtime.Gosched()
		}
	}
}

func newLifecycleEntry(t *testing.T) *worktreeWatcher {
	t.Helper()
	return New(nil, nil).buildWorktreeWatcher("workspace", t.TempDir())
}

func TestLifecycle_ActiveStagesDrainRepeatedClose(t *testing.T) {
	for _, stage := range []string{"file", "git", "callback"} {
		t.Run(stage, func(t *testing.T) { testLifecycleStage(t, stage) })
	}
}
func testLifecycleStage(t *testing.T, stage string) {
	w := newLifecycleEntry(t)
	entered, release := make(chan struct{}), make(chan struct{})
	var completed atomic.Bool
	gate := func() {
		close(entered)
		<-release
		if stage == "file" {
			completed.Store(true)
		}
	}
	var callbacks atomic.Int32
	w.onGitChanged = func(string) { callbacks.Add(1); completed.Store(true) }
	emit := w.emitGitChanged
	switch stage {
	case "file":
		w.sink = lifecycleSink{file: gate}
		emit = w.emitFilesChanged
	case "git":
		w.sink = lifecycleSink{git: gate}
	case "callback":
		w.onGitChanged = func(string) { gate(); callbacks.Add(1); completed.Store(true) }
	}
	emitted := startLifecycle(emit)
	awaitLifecycle(t, entered)
	first, firstID := startJoinedLifecycle(t, w.close, &completed)
	awaitLifecycle(t, w.done)
	second, secondID := startJoinedLifecycle(t, w.close, &completed)
	awaitLifecycleJoin(t, first, firstID)
	awaitLifecycleJoin(t, second, secondID)
	close(release)
	awaitLifecycle(t, first)
	awaitLifecycle(t, second)
	awaitLifecycle(t, emitted)
	if stage != "file" && callbacks.Load() != 1 {
		t.Error("admitted Git sequence did not complete")
	}
}

func TestLifecycle_RegistryOverlappingCallers(t *testing.T) {
	for _, pair := range []string{"close-close", "unwatch-unwatch", "close-unwatch", "unwatch-close"} {
		t.Run(pair, func(t *testing.T) { testRegistryCallers(t, pair) })
	}
}
func testRegistryCallers(t *testing.T, pair string) {
	ws := New(nil, nil)
	w := newLifecycleEntry(t)
	ws.entries[w.path] = w
	entered, release := make(chan struct{}), make(chan struct{})
	var completed atomic.Bool
	w.sink = lifecycleSink{file: func() { close(entered); <-release; completed.Store(true) }}
	emitted := startLifecycle(w.emitFilesChanged)
	awaitLifecycle(t, entered)
	unwatch := func() { ws.Unwatch(w.path) }
	firstCall, secondCall := ws.Close, ws.Close
	switch pair {
	case "unwatch-unwatch":
		firstCall, secondCall = unwatch, unwatch
	case "close-unwatch":
		secondCall = unwatch
	case "unwatch-close":
		firstCall = unwatch
	}
	first, firstID := startJoinedLifecycle(t, firstCall, &completed)
	awaitLifecycle(t, w.done)
	second, secondID := startJoinedLifecycle(t, secondCall, &completed)
	awaitLifecycleJoin(t, first, firstID)
	awaitLifecycleJoin(t, second, secondID)
	close(release)
	awaitLifecycle(t, first)
	awaitLifecycle(t, second)
	awaitLifecycle(t, emitted)
}

func TestLifecycle_CloseFirstRejectsDelivery(t *testing.T) {
	w := newLifecycleEntry(t)
	w.sink = lifecycleSink{file: func() { t.Error("late file") }, git: func() { t.Error("late Git") }}
	w.onGitChanged = func(string) { t.Error("late callback") }
	w.close()
	w.emitFilesChanged()
	w.emitGitChanged()
	w.notifyGitChanged()
}

func TestLifecycle_BranchLookupCancelledWithoutLateDelivery(t *testing.T) {
	w := newLifecycleEntry(t)
	entered := make(chan struct{})
	w.pendingAffectsBranch = true
	installGitCommand(w, func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		close(entered)
		<-ctx.Done()
		return exec.CommandContext(ctx, "git", args...), true
	})
	w.sink = lifecycleSink{git: func() { t.Error("late Git") }}
	w.onGitChanged = func(string) { t.Error("late callback") }
	emitted := startLifecycle(w.emitGitChanged)
	awaitLifecycle(t, entered)
	w.close()
	awaitLifecycle(t, emitted)
}

func TestLifecycle_SamePathReplacementWaitsAndRegistryReopens(t *testing.T) {
	ws := New(nil, nil)
	w := newLifecycleEntry(t)
	initGitRepo(t, w.path)
	ws.entries[w.path] = w
	entered, release := make(chan struct{}), make(chan struct{})
	var completed atomic.Bool
	w.sink = lifecycleSink{file: func() { close(entered); <-release; completed.Store(true) }}
	emitted := startLifecycle(w.emitFilesChanged)
	awaitLifecycle(t, entered)
	cleanupEntered, cleanupRelease := make(chan struct{}), make(chan struct{})
	w.beforeRegistryCleanup = func() { close(cleanupEntered); <-cleanupRelease }
	closed, closeID := startJoinedLifecycle(t, ws.Close, &completed)
	awaitLifecycle(t, w.done)
	var watchErr error
	watched, watchID := startJoinedLifecycle(t, func() { watchErr = ws.Watch("replacement", w.path) }, &completed)
	awaitLifecycleJoin(t, closed, closeID)
	awaitLifecycleJoin(t, watched, watchID)
	close(release)
	awaitLifecycle(t, cleanupEntered)
	awaitLifecycle(t, watched)
	awaitLifecycle(t, emitted)
	if watchErr != nil {
		t.Fatal(watchErr)
	}
	assertReplacementSurvivesCleanup(t, ws, w, cleanupRelease, closed)
}

func assertReplacementSurvivesCleanup(t *testing.T, ws *Watchers, w *worktreeWatcher, release chan struct{}, closed <-chan struct{}) {
	t.Helper()
	ws.mu.Lock()
	replacement := ws.entries[w.path]
	ws.mu.Unlock()
	if replacement == nil || replacement == w {
		t.Fatal("replacement was not installed before old cleanup")
	}
	close(release)
	awaitLifecycle(t, closed)
	ws.mu.Lock()
	retained := ws.entries[w.path]
	ws.mu.Unlock()
	if retained != replacement || !ws.IsWatching(w.path) {
		t.Fatal("replacement removed by old close")
	}
	ws.Close()
}

func TestLifecycle_SharedContextRetainsOtherWorkspace(t *testing.T) {
	ws := New(nil, nil)
	shared := t.TempDir()
	first, second := newContextLifecycleEntry(t, ws, shared), newContextLifecycleEntry(t, ws, shared)
	ws.mu.Lock()
	registration := ws.contexts[first.contextDir]
	ws.mu.Unlock()
	ws.Unwatch(first.path)
	ws.mu.Lock()
	retained := ws.contexts[second.contextDir]
	hasSecond := retained != nil && retained.workspacePaths[second.path]
	ws.mu.Unlock()
	if retained != registration || !hasSecond {
		t.Error("shared context registration not retained")
	}
	ws.Close()
}
func newContextLifecycleEntry(t *testing.T, ws *Watchers, shared string) *worktreeWatcher {
	t.Helper()
	root := t.TempDir()
	initGitRepo(t, root)
	if err := os.Symlink(shared, filepath.Join(root, ".my-context")); err != nil {
		t.Fatal(err)
	}
	if err := ws.Watch("workspace", root); err != nil {
		t.Fatal(err)
	}
	return ws.entries[root]
}

func TestLifecycle_AdmittedBeforeInvocationDelaysClose(t *testing.T) {
	w := newLifecycleEntry(t)
	if !w.admitNotification() {
		t.Fatal("admission rejected")
	}
	var completed atomic.Bool
	closed := startGuardedLifecycle(t, w.close, &completed)
	awaitLifecycle(t, w.done)
	requireDraining(t, closed)
	// The admitted sequence has not invoked a callback yet; it still owns a drain slot.
	invoked := false
	w.sink = lifecycleSink{file: func() { invoked = true; completed.Store(true) }}
	func() { defer w.finishNotification(); w.sink.PublishWorkspaceFilesChanged(FilesChangedEvent{}) }()
	awaitLifecycle(t, closed)
	if !invoked || w.admitNotification() {
		t.Fatal("invalid admission ordering")
	}
}

func TestLifecycle_CloseSealsAllBeforeWaiting(t *testing.T) {
	ws := New(nil, nil)
	first, second := newLifecycleEntry(t), newLifecycleEntry(t)
	ws.entries[first.path], ws.entries[second.path] = first, second
	if !first.admitNotification() || !second.admitNotification() {
		t.Fatal("admission rejected")
	}
	closed := startLifecycle(ws.Close)
	awaitLifecycle(t, first.done)
	awaitLifecycle(t, second.done)
	if first.admitNotification() || second.admitNotification() {
		t.Fatal("close did not seal all entries")
	}
	first.finishNotification()
	second.finishNotification()
	awaitLifecycle(t, closed)
}
