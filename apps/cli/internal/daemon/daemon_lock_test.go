package daemon

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAcquireDaemonLockExcludesSecondHolder(t *testing.T) {
	path := filepath.Join(t.TempDir(), lockFileName)

	lock, err := acquireDaemonLock(path)
	if err != nil {
		t.Fatalf("first acquire failed: %v", err)
	}
	defer lock.Release()

	if _, err := acquireDaemonLock(path); !errors.Is(err, errDaemonLocked) {
		t.Fatalf("second acquire: got %v, want errDaemonLocked", err)
	}
}

func TestDaemonLockReleaseAllowsReacquire(t *testing.T) {
	path := filepath.Join(t.TempDir(), lockFileName)

	lock, err := acquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	lock.Release()
	lock.Release() // double release is a no-op

	lock, err = acquireDaemonLock(path)
	if err != nil {
		t.Fatalf("reacquire after release failed: %v", err)
	}
	lock.Release()
}

func TestDaemonLockRecordsHolderPID(t *testing.T) {
	path := filepath.Join(t.TempDir(), lockFileName)

	if pid := LockHolderPID(path); pid != 0 {
		t.Fatalf("missing lock file: got holder pid %d, want 0", pid)
	}

	lock, err := acquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	defer lock.Release()

	if pid := LockHolderPID(path); pid != os.Getpid() {
		t.Fatalf("holder pid: got %d, want %d", pid, os.Getpid())
	}
}

func TestIsLockHeld(t *testing.T) {
	path := filepath.Join(t.TempDir(), lockFileName)

	if isLockHeld(path) {
		t.Fatal("isLockHeld on free lock: want false")
	}

	lock, err := acquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	defer lock.Release()

	if !isLockHeld(path) {
		t.Fatal("isLockHeld on held lock: want true")
	}
}

func TestResolveLockFilePathSitsNextToState(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")

	lockPath, err := ResolveLockFilePath(configPath)
	if err != nil {
		t.Fatalf("resolve lock path: %v", err)
	}

	want := filepath.Join(filepath.Dir(configPath), lockFileName)
	if lockPath != want {
		t.Fatalf("lock path: got %q, want %q", lockPath, want)
	}
}
