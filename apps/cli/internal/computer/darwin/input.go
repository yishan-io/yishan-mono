//go:build darwin

package darwin

/*
#include <stdlib.h>
#include "bridge.h"
*/
import "C"

import (
	"strings"
	"unsafe"

	"yishan/apps/cli/internal/computer"
)

func movePointer(point computer.Point) error {
	if !bool(C.ys_move_pointer(C.double(point.X), C.double(point.Y))) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to move pointer")
	}
	return nil
}

func click(request computer.ClickRequest) error {
	button := 0
	if strings.EqualFold(request.Button, "right") {
		button = 1
	}
	count := request.Count
	if count <= 0 {
		count = 1
	}
	if !bool(C.ys_mouse_click(C.double(request.Point.X), C.double(request.Point.Y), C.int(button), C.int(count))) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to click pointer")
	}
	return nil
}

func drag(request computer.DragRequest) error {
	if !bool(C.ys_mouse_drag(C.double(request.From.X), C.double(request.From.Y), C.double(request.To.X), C.double(request.To.Y))) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to drag pointer")
	}
	return nil
}

func scroll(request computer.ScrollRequest) error {
	if !bool(C.ys_scroll_wheel(C.double(request.Point.X), C.double(request.Point.Y), C.int(request.DeltaX), C.int(request.DeltaY))) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to scroll")
	}
	return nil
}

func typeText(text string) error {
	value := C.CString(text)
	defer C.free(unsafe.Pointer(value))
	if !bool(C.ys_type_text(value)) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to type text")
	}
	return nil
}

func sendKey(request computer.KeyRequest) error {
	flags := modifierFlags(request.Modifiers)
	key := C.CString(request.Key)
	defer C.free(unsafe.Pointer(key))
	down := 1
	up := 1
	if request.Down && !request.Up {
		up = 0
	}
	if request.Up && !request.Down {
		down = 0
	}
	if !bool(C.ys_send_key(key, C.int(flags), C.int(down), C.int(up))) {
		return computer.NewErrorWithDetails(computer.ErrorCodeUnsupportedAction, "failed to send key", map[string]any{"key": request.Key}, false)
	}
	return nil
}

func modifierFlags(modifiers []string) int {
	flags := 0
	for _, modifier := range modifiers {
		switch strings.ToLower(strings.TrimSpace(modifier)) {
		case "cmd", "command":
			flags |= 1
		case "ctrl", "control":
			flags |= 2
		case "alt", "option":
			flags |= 4
		case "shift":
			flags |= 8
		}
	}
	return flags
}
