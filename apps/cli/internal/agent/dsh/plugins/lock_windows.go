//go:build windows

package plugins

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

func tryAcquirePluginLock(path string) (*pluginLock, error) {
	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("encode plugin lock path: %w", err)
	}
	handle, err := windows.CreateFile(pathPtr, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		if errors.Is(err, windows.ERROR_SHARING_VIOLATION) || errors.Is(err, windows.ERROR_ACCESS_DENIED) {
			return nil, ErrPluginLocked
		}
		return nil, fmt.Errorf("open plugin lock %q: %w", path, err)
	}
	return &pluginLock{file: os.NewFile(uintptr(handle), path)}, nil
}
