package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// LockPolicy controls lock retry behavior. Defaults mirror pi's
// proper-lockfile retry shape; tests use a fast policy.
type LockPolicy struct {
	MaxAttempts int
	MinDelay    time.Duration
	MaxDelay    time.Duration
}

func defaultLockPolicy() LockPolicy {
	return LockPolicy{
		MaxAttempts: 10,
		MinDelay:    100 * time.Millisecond,
		MaxDelay:    10 * time.Second,
	}
}

// acquireAuthLock implements a proper-lockfile-compatible lock at
// <path>.lock: exclusive create, 30s mtime staleness, bounded retry with
// backoff, and stale-lock stealing. The returned release removes the lock
// only when the file still belongs to this process.
func acquireAuthLock(path string, policy LockPolicy) (func() error, error) {
	lockPath := path + ".lock"
	owner := lockOwnerID()
	delay := policy.MinDelay
	for attempt := 0; attempt < policy.MaxAttempts; attempt++ {
		if err := createLockFile(lockPath, owner); err == nil {
			return func() error { return releaseAuthLock(lockPath, owner) }, nil
		} else if !errors.Is(err, os.ErrExist) {
			return nil, err
		}

		stale, err := isLockStale(lockPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		if stale {
			if err := removeStaleLock(lockPath, owner); err != nil {
				return nil, err
			}
			// Restart the retry budget after a successful steal so a stale lock
			// found on the final attempt still gets one full acquire cycle.
			attempt = -1
			continue
		}
		if attempt == policy.MaxAttempts-1 {
			return nil, ErrLocked
		}
		time.Sleep(delay)
		delay *= 2
		if delay > policy.MaxDelay {
			delay = policy.MaxDelay
		}
	}
	return nil, ErrLocked
}

func createLockFile(lockPath string, owner string) error {
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := file.WriteString(owner); err != nil {
		file.Close()
		_ = os.Remove(lockPath)
		return fmt.Errorf("write pi auth lock: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(lockPath)
		return fmt.Errorf("close pi auth lock: %w", err)
	}
	return nil
}

func isLockStale(lockPath string) (bool, error) {
	info, err := os.Stat(lockPath)
	if err != nil {
		return false, err
	}
	return time.Since(info.ModTime()) > lockStaleDuration, nil
}

func lockOwnerID() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown"
	}
	return fmt.Sprintf("%s:%d", hostname, os.Getpid())
}

// removeStaleLock deletes a stale lock only when it still looks stale at
// removal time, avoiding the stat-then-remove window where a contender could
// have stolen the stale lock and created a fresh one. The read-then-remove
// sequence is still non-atomic (matching proper-lockfile's own stat+unlink);
// the acquire loop retries after removal, which self-heals any lost race.
func removeStaleLock(lockPath string, owner string) error {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if strings.TrimSpace(string(data)) == owner {
		// Our own stale lock from a previous attempt — safe to remove.
		if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove stale pi auth lock: %w", err)
		}
		return nil
	}
	// Another process may hold the lock now (or it is genuinely stale from a
	// crashed writer). Only remove when it still reads as stale.
	stale, err := isLockStale(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if stale {
		if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove stale pi auth lock: %w", err)
		}
	}
	return nil
}

func releaseAuthLock(lockPath string, owner string) error {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if strings.TrimSpace(string(data)) != owner {
		// Lock was stolen or replaced by another writer; do not remove it.
		return nil
	}
	if err := os.Remove(lockPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove pi auth lock: %w", err)
	}
	return nil
}
