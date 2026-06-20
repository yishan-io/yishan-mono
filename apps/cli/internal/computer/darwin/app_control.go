//go:build darwin

package darwin

/*
#include <stdlib.h>
#include "bridge.h"
*/
import "C"

import (
	"unsafe"

	"yishan/apps/cli/internal/computer"
)

func focusWindow(windowID string) error {
	nativeID, err := parseOpaqueID(windowID, "window_")
	if err != nil {
		return err
	}
	if !bool(C.ys_focus_window(C.uint(nativeID))) {
		return computer.NewErrorWithDetails(computer.ErrorCodeTargetNotFound, "failed to focus window", map[string]any{"windowId": windowID}, false)
	}
	return nil
}

func launchApplication(bundleID string) error {
	value := C.CString(bundleID)
	defer C.free(unsafe.Pointer(value))
	if !bool(C.ys_launch_application(value)) {
		return computer.NewErrorWithDetails(computer.ErrorCodeTargetNotFound, "failed to launch application", map[string]any{"bundleId": bundleID}, false)
	}
	return nil
}
