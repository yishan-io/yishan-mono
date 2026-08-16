//go:build !windows

package daemon

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

// tryAcquireDaemonLock opens the lock file and takes an exclusive non-blocking
// flock. flock is tied to the open file description, so the lock is released
// automatically when the owning process exits, even on SIGKILL.
func tryAcquireDaemonLock(path string) (*os.File, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open daemon lock file %q: %w", path, err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errDaemonLocked
		}
		return nil, fmt.Errorf("lock daemon file %q: %w", path, err)
	}
	return file, nil
}
