package plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const (
	pluginLockName    = ".plugins.lock"
	pluginLockRetry   = 25 * time.Millisecond
	pluginLockTimeout = 5 * time.Second
)

var ErrPluginLocked = errors.New("DSH plugin root is locked")

type pluginLock struct{ file *os.File }

func canonicalPluginRoot(root string) (string, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve plugin root: %w", err)
	}
	if err := os.MkdirAll(absolute, 0o700); err != nil {
		return "", fmt.Errorf("create plugin root: %w", err)
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("canonicalize plugin root: %w", err)
	}
	return canonical, nil
}

func waitForPluginLock(ctx context.Context, root string) (*pluginLock, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	deadline := time.NewTimer(pluginLockTimeout)
	defer deadline.Stop()
	for {
		lock, err := tryAcquirePluginLock(filepath.Join(root, pluginLockName))
		if err == nil || !errors.Is(err, ErrPluginLocked) {
			return lock, err
		}
		if err := waitForPluginLockRetry(ctx, deadline.C); err != nil {
			return nil, err
		}
	}
}

func waitForPluginLockRetry(ctx context.Context, deadline <-chan time.Time) error {
	retry := time.NewTimer(pluginLockRetry)
	defer retry.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-deadline:
		return ErrPluginLocked
	case <-retry.C:
		return nil
	}
}

func (lock *pluginLock) Release() {
	if lock == nil || lock.file == nil {
		return
	}
	_ = lock.file.Close() // Closing releases the advisory lock.
	lock.file = nil
}
