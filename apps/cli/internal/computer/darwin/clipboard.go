//go:build darwin

package darwin

/*
#include <stdlib.h>
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"unsafe"

	"yishan/apps/cli/internal/computer"
)

func readClipboard() (computer.ClipboardContent, error) {
	raw, err := readBridgeString(C.ys_read_clipboard_json())
	if err != nil {
		return computer.ClipboardContent{}, computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to read clipboard")
	}
	var content computer.ClipboardContent
	if err := json.Unmarshal(raw, &content); err != nil {
		return computer.ClipboardContent{}, nativeFailure("failed to decode clipboard contents", map[string]any{"error": err.Error()})
	}
	return content, nil
}

func writeClipboard(content computer.ClipboardContent) error {
	if content.Text == "" {
		if !bool(C.ys_clear_clipboard()) {
			return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to clear clipboard")
		}
		return nil
	}
	value := C.CString(content.Text)
	defer C.free(unsafe.Pointer(value))
	if !bool(C.ys_write_clipboard_text(value)) {
		return computer.NewError(computer.ErrorCodeNativeAPIFailed, "failed to write clipboard")
	}
	return nil
}

func focusedElementIsSensitive() bool {
	return bool(C.ys_focused_element_is_sensitive())
}
