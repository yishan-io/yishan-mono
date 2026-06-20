//go:build darwin

package darwin

/*
#cgo darwin CFLAGS: -x objective-c -fmodules
#cgo darwin LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation -framework Foundation -framework AppKit -framework ScreenCaptureKit
#include <stdlib.h>
#include "bridge.h"
*/
import "C"

import "unsafe"

func axIsTrusted() bool {
	return bool(C.ys_ax_is_trusted())
}

func preflightScreenCapture() bool {
	return bool(C.ys_preflight_screen_capture())
}

func openPermissionSettings(permission string) bool {
	value := C.CString(permission)
	defer C.free(unsafe.Pointer(value))
	return bool(C.ys_open_permission_settings(value))
}
