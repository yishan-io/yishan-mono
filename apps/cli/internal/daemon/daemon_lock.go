package daemon

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// errDaemonLocked is returned when another live daemon already holds the
// exclusive per-profile lock.
var errDaemonLocked = errors.New("daemon already running for this profile")

// lockFileName is the per-profile lock file, stored next to daemon.state.json.
const lockFileName = "daemon.lock"

// ResolveLockFilePath returns the profile lock file path for a config path.
func ResolveLockFilePath(configPath string) (string, error) {
	statePath, err := ResolveStateFilePath(configPath)
	if err != nil {
		return "", err
	}
	return lockFilePathForState(statePath), nil
}

// lockFilePathForState returns the lock file path next to a daemon state file.
func lockFilePathForState(statePath string) string {
	return filepath.Join(filepath.Dir(statePath), lockFileName)
}

// daemonLock is an exclusive advisory lock scoped to one daemon profile.
// The lock is released when Release is called or when the owning process
// exits, even on SIGKILL, so stale locks never accumulate.
type daemonLock struct {
	file *os.File
}

// acquireDaemonLock takes the profile lock, returning errDaemonLocked when
// another live daemon holds it. The holder PID is written to the lock file
// for diagnostics; it is best-effort and never relied on for correctness.
func acquireDaemonLock(path string) (*daemonLock, error) {
	file, err := tryAcquireDaemonLock(path)
	if err != nil {
		return nil, err
	}
	_ = writeLockHolderPID(file, os.Getpid())
	return &daemonLock{file: file}, nil
}

// Release drops the lock. It is safe to call multiple times or on a nil lock.
func (l *daemonLock) Release() {
	if l == nil || l.file == nil {
		return
	}
	_ = l.file.Close()
	l.file = nil
}

// isLockHeld reports whether another live daemon currently holds the lock.
func isLockHeld(path string) bool {
	file, err := tryAcquireDaemonLock(path)
	if err != nil {
		return errors.Is(err, errDaemonLocked)
	}
	_ = file.Close()
	return false
}

// LockHolderPID reads the holder PID recorded in the lock file. It returns 0
// when no holder is recorded or the value is not a valid PID.
func LockHolderPID(path string) int {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || pid <= 0 {
		return 0
	}
	return pid
}

// writeLockHolderPID records pid in the lock file. Best-effort diagnostics.
func writeLockHolderPID(file *os.File, pid int) error {
	if file == nil {
		return nil
	}
	if err := file.Truncate(0); err != nil {
		return fmt.Errorf("truncate daemon lock file: %w", err)
	}
	if _, err := file.WriteAt([]byte(strconv.Itoa(pid)+"\n"), 0); err != nil {
		return fmt.Errorf("write daemon lock holder pid: %w", err)
	}
	return file.Sync()
}
