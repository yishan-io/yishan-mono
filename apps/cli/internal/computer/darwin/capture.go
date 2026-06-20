//go:build darwin

package darwin

/*
#include <stdlib.h>
#include "bridge.h"
*/
import "C"

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unsafe"

	"yishan/apps/cli/internal/computer"
)

func captureDisplay(displayID string, options computer.CaptureOptions) (computer.Image, error) {
	nativeID, err := parseOpaqueID(displayID, "display_")
	if err != nil {
		return computer.Image{}, err
	}
	normalized := normalizeCaptureOptions(options)
	format := C.CString(normalized.Format)
	defer C.free(unsafePointer(format))

	hasRegion := 0
	region := computer.Rect{}
	if normalized.Region != nil {
		hasRegion = 1
		region = *normalized.Region
	}

	raw, err := readBridgeString(C.ys_capture_display_json(
		C.uint(nativeID),
		C.double(region.X),
		C.double(region.Y),
		C.double(region.Width),
		C.double(region.Height),
		C.int(hasRegion),
		C.int(normalized.MaxWidth),
		C.int(normalized.MaxHeight),
		format,
	))
	if err != nil {
		return computer.Image{}, computer.NewErrorWithDetails(computer.ErrorCodeCaptureFailed, "failed to capture display", map[string]any{"displayId": displayID}, false)
	}
	return decodeCaptureImage(raw)
}

func captureWindow(windowID string, options computer.CaptureOptions) (computer.Image, error) {
	nativeID, err := parseOpaqueID(windowID, "window_")
	if err != nil {
		return computer.Image{}, err
	}
	normalized := normalizeCaptureOptions(options)
	format := C.CString(normalized.Format)
	defer C.free(unsafePointer(format))

	raw, err := readBridgeString(C.ys_capture_window_json(
		C.uint(nativeID),
		C.int(normalized.MaxWidth),
		C.int(normalized.MaxHeight),
		format,
	))
	if err != nil {
		return computer.Image{}, computer.NewErrorWithDetails(computer.ErrorCodeCaptureFailed, "failed to capture window", map[string]any{"windowId": windowID}, false)
	}
	return decodeCaptureImage(raw)
}

func normalizeCaptureOptions(options computer.CaptureOptions) computer.CaptureOptions {
	if options.Format == "" {
		options.Format = "png"
	}
	options.Format = strings.ToLower(strings.TrimSpace(options.Format))
	if options.Format != "jpeg" && options.Format != "jpg" {
		options.Format = "png"
	}
	if options.MaxWidth < 0 {
		options.MaxWidth = 0
	}
	if options.MaxHeight < 0 {
		options.MaxHeight = 0
	}
	return options
}

func decodeCaptureImage(raw []byte) (computer.Image, error) {
	var image computer.Image
	if err := json.Unmarshal(raw, &image); err != nil {
		return computer.Image{}, nativeFailure("failed to decode capture image", map[string]any{"error": err.Error()})
	}
	image.CapturedAt = time.Now().UTC().Format(time.RFC3339)
	return image, nil
}

func parseOpaqueID(value string, prefix string) (uint32, error) {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, prefix) {
		return 0, computer.NewErrorWithDetails(computer.ErrorCodeTargetNotFound, "invalid target identifier", map[string]any{"id": value}, false)
	}
	nativeID, err := strconv.ParseUint(strings.TrimPrefix(trimmed, prefix), 10, 32)
	if err != nil {
		return 0, computer.NewErrorWithDetails(computer.ErrorCodeTargetNotFound, "invalid target identifier", map[string]any{"id": value}, false)
	}
	return uint32(nativeID), nil
}

func unsafePointer(value *C.char) unsafe.Pointer {
	return unsafe.Pointer(value)
}
