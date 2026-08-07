package daemon

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAcquireDaemonLockExcludesSecondHolder(t *testing.T) {
	path := filepath.Join(t.TempDir(), LockFileName)

	lock, err := AcquireDaemonLock(path)
	if err != nil {
		t.Fatalf("first acquire failed: %v", err)
	}
	defer lock.Release()

	if _, err := AcquireDaemonLock(path); !errors.Is(err, ErrDaemonLocked) {
		t.Fatalf("second acquire: got %v, want ErrDaemonLocked", err)
	}
}

func TestDaemonLockReleaseAllowsReacquire(t *testing.T) {
	path := filepath.Join(t.TempDir(), LockFileName)

	lock, err := AcquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	lock.Release()
	lock.Release() // double release is a no-op

	lock, err = AcquireDaemonLock(path)
	if err != nil {
		t.Fatalf("reacquire after release failed: %v", err)
	}
	lock.Release()
}

func TestDaemonLockRecordsHolderPID(t *testing.T) {
	path := filepath.Join(t.TempDir(), LockFileName)

	if pid := LockHolderPID(path); pid != 0 {
		t.Fatalf("missing lock file: got holder pid %d, want 0", pid)
	}

	lock, err := AcquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	defer lock.Release()

	if pid := LockHolderPID(path); pid != os.Getpid() {
		t.Fatalf("holder pid: got %d, want %d", pid, os.Getpid())
	}
}

func TestIsLockHeld(t *testing.T) {
	path := filepath.Join(t.TempDir(), LockFileName)

	if IsLockHeld(path) {
		t.Fatal("IsLockHeld on free lock: want false")
	}

	lock, err := AcquireDaemonLock(path)
	if err != nil {
		t.Fatalf("acquire failed: %v", err)
	}
	defer lock.Release()

	if !IsLockHeld(path) {
		t.Fatal("IsLockHeld on held lock: want true")
	}
}

func TestResolveLockFilePathSitsNextToState(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "credential.yaml")

	lockPath, err := ResolveLockFilePath(configPath)
	if err != nil {
		t.Fatalf("resolve lock path: %v", err)
	}

	want := filepath.Join(filepath.Dir(configPath), LockFileName)
	if lockPath != want {
		t.Fatalf("lock path: got %q, want %q", lockPath, want)
	}
}
