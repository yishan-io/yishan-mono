package files

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

type blockedListing struct {
	service *FileService
	root    string
	entered chan int
	release chan error
	calls   atomic.Int32
	active  atomic.Int32
	peak    atomic.Int32
}

func newBlockedListing(t *testing.T) *blockedListing {
	t.Helper()
	b := &blockedListing{service: NewFileService(), root: t.TempDir(), entered: make(chan int, 32), release: make(chan error, 32)}
	b.service.gitCommand = scriptedGit("", "", "", false)
	b.service.walkDir = func(string, fs.WalkDirFunc) error {
		active := b.active.Add(1)
		for peak := b.peak.Load(); active > peak; peak = b.peak.Load() {
			if b.peak.CompareAndSwap(peak, active) {
				break
			}
		}
		b.entered <- int(b.calls.Add(1))
		err := <-b.release
		b.active.Add(-1)
		return err
	}
	return b
}

func (b *blockedListing) join(t *testing.T) (recursiveScanKey, *recursiveScan) {
	t.Helper()
	key, identity, err := identifyRecursiveScan(b.root, "")
	if err != nil {
		t.Fatal(err)
	}
	return key, b.service.joinRecursiveScan(key, identity, nil)
}

func awaitListing(t *testing.T, b *blockedListing, key recursiveScanKey, scan *recursiveScan) {
	t.Helper()
	_, shouldRetry, err := b.service.waitRecursiveScan(context.Background(), key, scan, nil)
	if err != nil || shouldRetry {
		t.Fatalf("retry=%v err=%v", shouldRetry, err)
	}
}

func TestRecursiveScan_EquivalentWaitersShareExecutor(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	scans := []*recursiveScan{scan}
	for range 15 {
		_, joined := b.join(t)
		scans = append(scans, joined)
	}
	b.release <- nil
	for _, joined := range scans {
		awaitListing(t, b, key, joined)
	}
	if b.calls.Load() != 1 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
	key, scan = b.join(t)
	<-b.entered
	b.release <- nil
	awaitListing(t, b, key, scan)
	if b.calls.Load() != 2 {
		t.Fatal("recursive result persisted")
	}
}

func TestRecursiveScan_LastCancellationRetainsActiveSlot(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := b.service.waitRecursiveScan(ctx, key, scan, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	_, replacement := b.join(t)
	if b.calls.Load() != 1 {
		t.Fatal("overlapping replacement")
	}
	b.release <- nil
	<-scan.done
	_, shouldRetry, err := b.service.waitRecursiveScan(context.Background(), key, replacement, nil)
	if err != nil || !shouldRetry {
		t.Fatalf("retry=%v err=%v", shouldRetry, err)
	}
	key, scan = b.join(t)
	<-b.entered
	b.release <- nil
	awaitListing(t, b, key, scan)
	if b.peak.Load() != 1 {
		t.Fatalf("peak=%d", b.peak.Load())
	}
}

func TestRecursiveScan_WaiterCancellationIsIsolated(t *testing.T) {
	b := newBlockedListing(t)
	key, first := b.join(t)
	<-b.entered
	_, second := b.join(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err := b.service.waitRecursiveScan(ctx, key, first, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	b.release <- nil
	awaitListing(t, b, key, second)
	if b.calls.Load() != 1 {
		t.Fatalf("calls=%d", b.calls.Load())
	}
}

func TestRecursiveScan_InvalidationPublishesInterimAndCoalescesFollowup(t *testing.T) {
	b := newBlockedListing(t)
	for round := range 4 {
		key, scan := b.join(t)
		<-b.entered
		for range 10 {
			b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
		}
		_, newer := b.join(t)
		b.release <- nil
		publications := 0
		publish := func(entries []FileEntry) {
			publications++
			b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
		}
		for _, joined := range []*recursiveScan{scan, newer} {
			_, shouldRetry, err := b.service.waitRecursiveScan(context.Background(), key, joined, publish)
			if err != nil || !shouldRetry {
				t.Fatalf("retry=%v err=%v", shouldRetry, err)
			}
		}
		if publications != 2 || b.calls.Load() != int32(round+1) {
			t.Fatalf("publications=%d calls=%d", publications, b.calls.Load())
		}
	}
	key, scan := b.join(t)
	<-b.entered
	b.release <- nil
	awaitListing(t, b, key, scan)
	if b.calls.Load() != 5 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestRecursiveScan_FailureAllowsRetryAfterTermination(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	failure := errors.New("filesystem failure")
	b.release <- failure
	_, _, err := b.service.waitRecursiveScan(context.Background(), key, scan, nil)
	if !errors.Is(err, failure) {
		t.Fatal(err)
	}
	key, scan = b.join(t)
	<-b.entered
	b.release <- nil
	awaitListing(t, b, key, scan)
	if b.calls.Load() != 2 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestRecursiveScan_RelinkRejectsOldSnapshot(t *testing.T) {
	b := newBlockedListing(t)
	target := t.TempDir()
	link := filepath.Join(b.root, ContextLinkName)
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	key, scan := b.join(t)
	<-b.entered
	if err := os.Remove(link); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(t.TempDir(), link); err != nil {
		t.Fatal(err)
	}
	_, newer := b.join(t)
	b.release <- nil
	for _, joined := range []*recursiveScan{scan, newer} {
		_, _, err := b.service.waitRecursiveScan(context.Background(), key, joined, func([]FileEntry) { t.Error("old lifecycle published") })
		if err == nil {
			t.Fatal("accepted old lifecycle")
		}
	}
	if b.calls.Load() != 1 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestRecursiveScan_CanonicalKeyAndRootIsolation(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(b.root, alias); err != nil {
		t.Fatal(err)
	}
	aliasKey, identity, err := identifyRecursiveScan(alias, ".")
	if err != nil {
		t.Fatal(err)
	}
	joined := b.service.joinRecursiveScan(aliasKey, identity, nil)
	otherKey, otherIdentity, err := identifyRecursiveScan(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	other := b.service.joinRecursiveScan(otherKey, otherIdentity, nil)
	<-b.entered
	b.release <- nil
	b.release <- nil
	awaitListing(t, b, key, scan)
	awaitListing(t, b, aliasKey, joined)
	awaitListing(t, b, otherKey, other)
	if b.calls.Load() != 2 {
		t.Fatalf("calls=%d", b.calls.Load())
	}
}

func TestRecursiveScan_ExpiredWorkerRetainsSlot(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	scan.cancel()
	_, newer := b.join(t)
	if b.calls.Load() != 1 {
		t.Fatal("overlap after worker cancellation")
	}
	b.release <- nil
	<-scan.done
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, shouldRetry, err := b.service.waitRecursiveScan(ctx, key, newer, nil)
	b.service.leaveRecursiveScan(scan)
	if err != nil || !shouldRetry {
		t.Fatalf("retry=%v err=%v", shouldRetry, err)
	}
	if b.peak.Load() != 1 {
		t.Fatal("overlap")
	}
}

func TestRecursiveScan_PublicProgressAndFreshFollowup(t *testing.T) {
	b := newBlockedListing(t)
	progress := make(chan []FileEntry)
	completed := make(chan error, 1)
	go func() {
		_, err := b.service.ListWithProgress(context.Background(), b.root, "", func(entries []FileEntry) { progress <- entries })
		completed <- err
	}()
	for range 4 {
		<-b.entered
		for range 10 {
			b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
		}
		b.release <- nil
		<-progress
	}
	<-b.entered
	b.release <- nil
	if err := <-completed; err != nil {
		t.Fatal(err)
	}
	if b.calls.Load() != 5 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestRecursiveScan_RetargetedRootNeverPublishesOldInterim(t *testing.T) {
	b := newBlockedListing(t)
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(b.root, alias); err != nil {
		t.Fatal(err)
	}
	completed := make(chan error, 1)
	var publications atomic.Int32
	go func() {
		_, err := b.service.ListWithProgress(context.Background(), alias, "", func([]FileEntry) { publications.Add(1) })
		completed <- err
	}()
	<-b.entered
	b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
	if err := os.Remove(alias); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(t.TempDir(), alias); err != nil {
		t.Fatal(err)
	}
	b.release <- nil
	if err := <-completed; err == nil {
		t.Fatal("accepted retargeted root")
	}
	if publications.Load() != 0 {
		t.Fatal("published old root lifecycle")
	}
}

func TestRecursiveScan_ReplacedRootRejectsOldSnapshot(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	moved := b.root + "-old"
	if err := os.Rename(b.root, moved); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(moved) })
	if err := os.Mkdir(b.root, 0700); err != nil {
		t.Fatal(err)
	}
	_, newer := b.join(t)
	b.release <- nil
	for _, joined := range []*recursiveScan{scan, newer} {
		_, _, err := b.service.waitRecursiveScan(context.Background(), key, joined, func([]FileEntry) { t.Error("old root published") })
		if err == nil {
			t.Fatal("accepted replaced root")
		}
	}
	if b.calls.Load() != 1 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}

func TestRecursiveScan_DeadlineRetainsBlockedExecutor(t *testing.T) {
	b := newBlockedListing(t)
	key, scan := b.join(t)
	<-b.entered
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, _, err := b.service.waitRecursiveScan(ctx, key, scan, nil)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal(err)
	}
	_, newer := b.join(t)
	if b.calls.Load() != 1 {
		t.Fatal("overlap after deadline")
	}
	b.release <- nil
	_, shouldRetry, err := b.service.waitRecursiveScan(context.Background(), key, newer, nil)
	if err != nil || !shouldRetry {
		t.Fatalf("retry=%v err=%v", shouldRetry, err)
	}
	if b.peak.Load() != 1 {
		t.Fatal("overlap")
	}
}

func TestRecursiveScan_DelayedWaitersShareCompletedFollowup(t *testing.T) {
	b := newBlockedListing(t)
	key, first := b.join(t)
	<-b.entered
	_, delayed := b.join(t)
	b.service.InvalidateWorkspacePaths(b.root, []string{"changed"})
	b.release <- nil
	_, retry, err := b.service.waitRecursiveScan(context.Background(), key, first, nil)
	if err != nil || !retry {
		t.Fatalf("retry=%v err=%v", retry, err)
	}
	_, identity, err := identifyRecursiveScan(b.root, "")
	if err != nil {
		t.Fatal(err)
	}
	followup := b.service.joinRecursiveScan(key, identity, first)
	<-b.entered
	b.release <- nil
	awaitListing(t, b, key, followup)
	_, retry, err = b.service.waitRecursiveScan(context.Background(), key, delayed, nil)
	if err != nil || !retry {
		t.Fatalf("retry=%v err=%v", retry, err)
	}
	covered := b.service.joinRecursiveScan(key, identity, delayed)
	awaitListing(t, b, key, covered)
	if b.calls.Load() != 2 || b.peak.Load() != 1 {
		t.Fatalf("calls=%d peak=%d", b.calls.Load(), b.peak.Load())
	}
}
