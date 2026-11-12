// Package lockfile provides an exclusive advisory inter-process lock backed by
// a lock file. The lock is held by the process, not by a goroutine registry, so
// independent CLI, daemon, and agent processes serialize their writes on the
// same file. The lock is released when Release is called or when the owning
// process exits, so stale locks never accumulate.
package lockfile

import (
	"errors"
	"fmt"
	"time"
)

// ErrTimeout indicates another process held the lock for the whole wait budget.
var ErrTimeout = errors.New("timed out waiting for lock file")

// retryDelay is the pause between non-blocking acquisition attempts.
const retryDelay = 20 * time.Millisecond

// Lock is one held exclusive advisory lock.
type Lock struct {
	release func()
}

// Release drops the lock. It is safe to call multiple times or on a nil lock.
func (l *Lock) Release() {
	if l == nil || l.release == nil {
		return
	}
	l.release()
	l.release = nil
}

// Acquire takes an exclusive lock on path, retrying until timeout expires.
func Acquire(path string, timeout time.Duration) (*Lock, error) {
	deadline := time.Now().Add(timeout)
	for {
		release, err := tryAcquire(path)
		if err == nil {
			return &Lock{release: release}, nil
		}
		if !errors.Is(err, errLocked) {
			return nil, fmt.Errorf("lock file %q: %w", path, err)
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("%w: %s", ErrTimeout, path)
		}
		time.Sleep(retryDelay)
	}
}
