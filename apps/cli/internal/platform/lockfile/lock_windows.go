//go:build windows

package lockfile

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// errLocked reports that a live process already holds this lock file.
var errLocked = errors.New("lock file already held")

// tryAcquire opens the lock file with sharing disabled, which makes the handle
// exclusive: any second open fails with a sharing violation until the first
// handle is closed, including when the owning process exits.
func tryAcquire(path string) (func(), error) {
	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode lock path: %w", err)
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
			return nil, errLocked
		}
		return nil, fmt.Errorf("open lock file: %w", err)
	}
	file := os.NewFile(uintptr(handle), path)
	return func() { _ = file.Close() }, nil
}
