package files

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListSnapshot_InvalidationReturnsBeforeQuiet(t *testing.T) {
	b := newBlockedListing(t)
	for _, dirty := range []bool{true, false} {
		completed := make(chan error, 1)
		go func() {
			snapshot, err := b.service.ListSnapshot(context.Background(), b.root, "", true)
			if err == nil && snapshot.IsFresh == dirty {
				t.Error("incorrect freshness")
			}
			completed <- err
		}()
		<-b.entered
		if dirty {
			b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
		}
		b.release <- nil
		select {
		case err := <-completed:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(time.Second):
			b.release <- nil
			t.Fatal("snapshot waited for quiet")
		}
	}
	if b.calls.Load() != 2 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestListSnapshot_RejectsChangedLifecycle(t *testing.T) {
	for _, kind := range []string{"root", "context"} {
		t.Run(kind, func(t *testing.T) {
			b := newBlockedListing(t)
			alias := filepath.Join(t.TempDir(), "alias")
			target := b.root
			if kind == "context" {
				alias, target = filepath.Join(b.root, ContextLinkName), t.TempDir()
			}
			if err := os.Symlink(target, alias); err != nil {
				t.Fatal(err)
			}
			root := b.root
			if kind == "root" {
				root = alias
			}
			completed := make(chan error, 1)
			go func() { _, err := b.service.ListSnapshot(context.Background(), root, "", true); completed <- err }()
			<-b.entered
			if err := os.Remove(alias); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(t.TempDir(), alias); err != nil {
				t.Fatal(err)
			}
			b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
			b.release <- nil
			if err := <-completed; err == nil {
				t.Fatal("accepted old lifecycle")
			}
		})
	}
}

func TestListSnapshot_ReplacesCanceledWorkerAfterExit(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	b.service.leaveRecursiveScan(scan)
	completed := make(chan error, 1)
	go func() {
		snapshot, err := b.service.ListSnapshot(context.Background(), b.root, "", true)
		if err == nil && !snapshot.IsFresh {
			t.Error("replacement was stale")
		}
		completed <- err
	}()
	awaitSnapshotWaiter(t, b, scan)
	if b.calls.Load() != 1 {
		t.Fatal("overlapping replacement")
	}
	b.release <- nil
	select {
	case <-b.entered:
		b.release <- nil
	case err := <-completed:
		t.Fatalf("replacement exited without scanning: %v", err)
	case <-time.After(time.Second):
		t.Fatal("replacement never started")
	}
	if err := <-completed; err != nil {
		t.Fatal(err)
	}
	if b.calls.Load() != 2 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d key=%v", b.calls.Load(), b.peak.Load(), key)
	}
}

func awaitSnapshotWaiter(t *testing.T, b *blockedListing, scan *recursiveScan) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		b.service.mu.Lock()
		joined := scan.waiters > 0
		b.service.mu.Unlock()
		if joined {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("snapshot waiter never joined")
}
