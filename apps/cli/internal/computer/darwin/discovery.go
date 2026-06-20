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

	"yishan/apps/cli/internal/computer"
)

func listDisplays() ([]computer.Display, error) {
	raw, err := readBridgeString(C.ys_list_displays_json())
	if err != nil {
		return nil, err
	}
	var displays []computer.Display
	if err := json.Unmarshal(raw, &displays); err != nil {
		return nil, nativeFailure("failed to decode display list", map[string]any{"error": err.Error()})
	}
	for index := range displays {
		displays[index].ID = displayID(displays[index].NativeID)
	}
	return displays, nil
}

func listApplications() ([]computer.Application, error) {
	raw, err := readBridgeString(C.ys_list_applications_json())
	if err != nil {
		return nil, err
	}
	var applications []computer.Application
	if err := json.Unmarshal(raw, &applications); err != nil {
		return nil, nativeFailure("failed to decode application list", map[string]any{"error": err.Error()})
	}
	for index := range applications {
		applications[index].ID = applicationID(applications[index].PID)
	}
	return applications, nil
}

func listWindows(filter computer.WindowFilter) ([]computer.Window, error) {
	raw, err := readBridgeString(C.ys_list_windows_json())
	if err != nil {
		return nil, err
	}
	var windows []computer.Window
	if err := json.Unmarshal(raw, &windows); err != nil {
		return nil, nativeFailure("failed to decode window list", map[string]any{"error": err.Error()})
	}
	filtered := make([]computer.Window, 0, len(windows))
	for _, window := range windows {
		window.ID = windowID(window.NativeID)
		if !matchesWindowFilter(window, filter) {
			continue
		}
		filtered = append(filtered, window)
	}
	return filtered, nil
}

func readBridgeString(value *C.char) ([]byte, error) {
	if value == nil {
		return nil, nativeFailure("native bridge returned empty data", nil)
	}
	defer C.ys_free_string(value)
	return []byte(C.GoString(value)), nil
}

func displayID(nativeID uint32) string {
	return "display_" + strconv.FormatUint(uint64(nativeID), 10)
}

func applicationID(pid int) string {
	return "app_" + strconv.Itoa(pid)
}

func windowID(nativeID uint32) string {
	return "window_" + strconv.FormatUint(uint64(nativeID), 10)
}

func matchesWindowFilter(window computer.Window, filter computer.WindowFilter) bool {
	if filter.PID != 0 && window.PID != filter.PID {
		return false
	}
	if filter.BundleID != "" && window.BundleID != filter.BundleID {
		return false
	}
	if filter.Title != "" && !strings.Contains(strings.ToLower(window.Title), strings.ToLower(filter.Title)) {
		return false
	}
	if filter.VisibleOnly && !window.Visible {
		return false
	}
	if filter.FrontmostOnly && !window.Frontmost {
		return false
	}
	if filter.ExcludeDesktop && window.Layer < 0 {
		return false
	}
	if filter.IncludeLayer != nil && window.Layer != *filter.IncludeLayer {
		return false
	}
	return true
}

func bundleIDByPID(applications []computer.Application) map[int]string {
	result := make(map[int]string, len(applications))
	for _, application := range applications {
		result[application.PID] = application.BundleID
	}
	return result
}

func enrichWindowsWithBundleIDs(windows []computer.Window, applications []computer.Application) []computer.Window {
	bundleIDs := bundleIDByPID(applications)
	for index := range windows {
		windows[index].BundleID = bundleIDs[windows[index].PID]
	}
	return windows
}
