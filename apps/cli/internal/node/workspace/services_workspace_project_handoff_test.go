package workspace

import (
	"context"
	"os/exec"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestWorkspaceOpenProject_MonitoringHandoff(t *testing.T) {
	s, store, before := newPathReconciliationFixture(t)
	oldRow, err := store.Get(context.Background(), before.ID)
	if err != nil {
		t.Fatal(err)
	}
	entryA := monitoringHandoffEntry(before, newMonitoringHandoffRepo(t))
	entryB := monitoringHandoffEntry(before, newMonitoringHandoffRepo(t))
	entered, release := make(chan struct{}), make(chan struct{})
	var callbacks atomic.Int32
	s.deps.WorkspaceAvailabilityChanged = func() {
		if callbacks.Add(1) == 1 {
			close(entered)
			<-release
		}
	}
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	doneA := openMonitoringHandoff(s, entryA)
	defer func() { unblock(); waitMonitoringHandoff(t, doneA) }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("A availability callback not reached")
	}
	// B must reconcile while A's callback is blocked: callbacks cannot hold the lock.
	waitMonitoringHandoff(t, openMonitoringHandoff(s, entryB))
	// Resume A before checking that its old monitoring cannot be installed after B.
	unblock()
	waitMonitoringHandoff(t, doneA)
	assertReconciledPath(t, s, store, before, oldRow, entryB.WorktreePath)
	if s.deps.Watchers.IsWatching(entryA.WorktreePath) {
		t.Error("stale A watcher installed after B")
	}
	if callbacks.Load() != 2 {
		t.Errorf("availability callbacks = %d, want 2", callbacks.Load())
	}
}

func TestWorkspaceOpenProject_SkipMonitoringIsIdempotent(t *testing.T) {
	s, _, before := newPathReconciliationFixture(t)
	s.deps.Watchers.Unwatch(before.Path)
	s.deps.PRTracker.StopTracking(before.ID)
	s.deps.WorkspaceAvailabilityChanged = func() { t.Error("skip notified availability") }
	entry := monitoringHandoffEntry(before, before.Path)
	for range 2 {
		id, didOpen, err := s.openProjectWorkspace(context.Background(), entry)
		if err != nil || didOpen || id != before.ID {
			t.Fatalf("skip = (%q, %v, %v)", id, didOpen, err)
		}
		if !s.deps.Watchers.IsWatching(before.Path) {
			t.Fatal("skip did not restore monitoring")
		}
	}
}

func monitoringHandoffEntry(ws workspace.Workspace, path string) rpc.WorkspaceOpenProjectEntry {
	return rpc.WorkspaceOpenProjectEntry{WorkspaceID: ws.ID, WorktreePath: normalizeWorkspaceOpenProjectPath(path),
		ProjectID: ws.ProjectID, OrgID: ws.OrgID, Kind: string(ws.Kind)}
}

func openMonitoringHandoff(s *Service, entry rpc.WorkspaceOpenProjectEntry) chan error {
	done := make(chan error, 1)
	go func() {
		_, _, err := s.openProjectWorkspace(context.Background(), entry)
		done <- err
		close(done)
	}()
	return done
}

func waitMonitoringHandoff(t *testing.T, done <-chan error) {
	t.Helper()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("openProject blocked during monitoring handoff")
	}
}

func newMonitoringHandoffRepo(t *testing.T) string {
	t.Helper()
	path := t.TempDir()
	command := exec.CommandContext(context.Background(), "git", "init", path)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("initialize monitoring handoff repo: %v\n%s", err, output)
	}
	return path
}
