//go:build !windows

package lockfile

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

// errLocked reports that a live process already holds this lock file.
var errLocked = errors.New("lock file already held")

// tryAcquire opens the lock file and takes an exclusive non-blocking flock.
// flock is tied to the open file description, so the lock is released
// automatically when the owning process exits, even on SIGKILL.
func tryAcquire(path string) (func(), error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errLocked
		}
		return nil, fmt.Errorf("flock: %w", err)
	}
	return func() { _ = file.Close() }, nil
}
