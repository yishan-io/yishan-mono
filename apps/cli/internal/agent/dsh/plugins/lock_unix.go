//go:build !windows

package plugins

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

func tryAcquirePluginLock(path string) (*pluginLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open plugin lock %q: %w", path, err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close() // The lock was not acquired.
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, ErrPluginLocked
		}
		return nil, fmt.Errorf("lock plugin root %q: %w", path, err)
	}
	return &pluginLock{file: file}, nil
}
