//go:build windows

package daemon

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// tryAcquireDaemonLock opens the lock file with sharing disabled, which makes
// the handle exclusive: any second open fails with a sharing violation until
// the first handle is closed, including when the owning process exits.
func tryAcquireDaemonLock(path string) (*os.File, error) {
	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode daemon lock path: %w", err)
	}
	handle, err := windows.CreateFile(
		pathPtr,
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		0, // dwShareMode: deny all sharing
		nil,
		windows.OPEN_ALWAYS,
		windows.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) || errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return nil, ErrDaemonLocked
		}
		return nil, fmt.Errorf("open daemon lock file %q: %w", path, err)
	}
	return os.NewFile(uintptr(handle), path), nil
}
