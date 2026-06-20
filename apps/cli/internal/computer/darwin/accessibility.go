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
	"unsafe"

	"yishan/apps/cli/internal/computer"
)

func getAccessibilityTree(target computer.Target, options computer.TreeOptions) (computer.AccessibilityNode, error) {
	pid, err := resolveTargetPID(target)
	if err != nil {
		return computer.AccessibilityNode{}, err
	}
	if options.MaxDepth <= 0 {
		options.MaxDepth = 6
	}
	if options.MaxNodes <= 0 {
		options.MaxNodes = 500
	}
	raw, err := readBridgeString(C.ys_get_ax_tree_json(C.int(pid), C.int(options.MaxDepth), C.int(options.MaxNodes), boolToCInt(options.RedactSensitive)))
	if err != nil {
		return computer.AccessibilityNode{}, computer.NewErrorWithDetails(computer.ErrorCodeTargetNotFound, "failed to inspect accessibility tree", map[string]any{"pid": pid}, false)
	}
	var node computer.AccessibilityNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return computer.AccessibilityNode{}, nativeFailure("failed to decode accessibility tree", map[string]any{"error": err.Error()})
	}
	return node, nil
}

func performAccessibilityAction(request computer.AccessibilityActionRequest) error {
	action := normalizeAXAction(request.Action)
	if action == "" {
		return computer.NewErrorWithDetails(computer.ErrorCodeUnsupportedAction, "unsupported accessibility action", map[string]any{"action": request.Action}, false)
	}
	elementID := C.CString(request.ElementID)
	defer C.free(unsafe.Pointer(elementID))
	actionValue := C.CString(action)
	defer C.free(unsafe.Pointer(actionValue))
	stringValue := C.CString(request.Value)
	defer C.free(unsafe.Pointer(stringValue))
	if !bool(C.ys_perform_ax_action(elementID, actionValue, stringValue)) {
		return computer.NewErrorWithDetails(computer.ErrorCodeTargetChanged, "failed to perform accessibility action", map[string]any{"elementId": request.ElementID, "action": action}, false)
	}
	return nil
}

func normalizeAXAction(action string) string {
	switch strings.TrimSpace(strings.ToLower(action)) {
	case "press":
		return "press"
	case "confirm":
		return "confirm"
	case "cancel":
		return "cancel"
	case "raise":
		return "raise"
	case "focus", "setfocused":
		return "focus"
	case "setvalue", "value":
		return "setValue"
	default:
		return ""
	}
}

func resolveTargetPID(target computer.Target) (int, error) {
	if target.PID != 0 {
		return target.PID, nil
	}
	if target.ApplicationID != "" {
		value, err := parseOpaqueID(target.ApplicationID, "app_")
		if err != nil {
			return 0, err
		}
		return int(value), nil
	}
	if target.WindowID != "" {
		windows, err := listWindows(computer.WindowFilter{})
		if err != nil {
			return 0, err
		}
		for _, window := range windows {
			if window.ID == strings.TrimSpace(target.WindowID) {
				return window.PID, nil
			}
		}
	}
	if target.ElementID != "" {
		parts := strings.SplitN(strings.TrimPrefix(target.ElementID, "ax_"), "_", 2)
		if len(parts) > 0 {
			pid, err := strconv.Atoi(parts[0])
			if err == nil {
				return pid, nil
			}
		}
	}
	return 0, computer.NewError(computer.ErrorCodeTargetNotFound, "target pid could not be resolved")
}

func boolToCInt(value bool) C.int {
	if value {
		return 1
	}
	return 0
}
