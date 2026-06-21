//go:build darwin

package darwin

import (
	"context"

	"yishan/apps/cli/internal/computer"
)

type Runtime struct {
	computer.NoopRuntime
}

func New() *Runtime {
	return &Runtime{NoopRuntime: computer.NoopRuntime{Platform: "darwin", Reason: "computer runtime capability is not implemented yet"}}
}

func (r *Runtime) Health(_ context.Context) (computer.RuntimeHealth, error) {
	return computer.RuntimeHealth{Available: true, Platform: "darwin"}, nil
}

func (r *Runtime) Permissions(_ context.Context) (computer.PermissionStatus, error) {
	status := computer.PermissionStatus{
		Accessibility:   permissionState(axIsTrusted()),
		ScreenRecording: permissionState(preflightScreenCapture()),
		InputMonitoring: computer.PermissionStateUnknown,
		Automation:      computer.PermissionStateNotRequired,
		Camera:          computer.PermissionStateNotRequested,
		FullDiskAccess:  computer.PermissionStateCheckManually,
		LocalNetwork:    computer.PermissionStateCheckManually,
		USBDevices:      computer.PermissionStateEntitled,
		Bluetooth:       computer.PermissionStateEntitled,
	}
	if status.Accessibility != computer.PermissionStateGranted {
		status.Remediation = append(status.Remediation, "Grant Accessibility in System Settings > Privacy & Security > Accessibility")
	}
	if status.ScreenRecording != computer.PermissionStateGranted {
		status.Remediation = append(status.Remediation, "Grant Screen Recording in System Settings > Privacy & Security > Screen Recording")
	}
	return status, nil
}

func (r *Runtime) OpenPermissionSettings(_ context.Context, permission string) error {
	if !openPermissionSettings(permission) {
		return nativeFailure("failed to open macOS Privacy settings", map[string]any{"permission": permission})
	}
	return nil
}

func (r *Runtime) ListDisplays(_ context.Context) ([]computer.Display, error) {
	return listDisplays()
}

func (r *Runtime) ListApplications(_ context.Context) ([]computer.Application, error) {
	return listApplications()
}

func (r *Runtime) ListWindows(_ context.Context, filter computer.WindowFilter) ([]computer.Window, error) {
	applications, err := listApplications()
	if err != nil {
		return nil, err
	}
	windows, err := listWindows(filter)
	if err != nil {
		return nil, err
	}
	return enrichWindowsWithBundleIDs(windows, applications), nil
}

func (r *Runtime) CaptureDisplay(_ context.Context, displayID string, options computer.CaptureOptions) (computer.Image, error) {
	return captureDisplay(displayID, options)
}

func (r *Runtime) CaptureWindow(_ context.Context, windowID string, options computer.CaptureOptions) (computer.Image, error) {
	return captureWindow(windowID, options)
}

func (r *Runtime) GetAccessibilityTree(_ context.Context, target computer.Target, options computer.TreeOptions) (computer.AccessibilityNode, error) {
	return getAccessibilityTree(target, options)
}

func (r *Runtime) PerformAccessibilityAction(_ context.Context, request computer.AccessibilityActionRequest) error {
	return performAccessibilityAction(request)
}

func (r *Runtime) FocusWindow(_ context.Context, windowID string) error {
	return focusWindow(windowID)
}

func (r *Runtime) LaunchApplication(_ context.Context, bundleID string) error {
	return launchApplication(bundleID)
}

func (r *Runtime) MovePointer(_ context.Context, point computer.Point) error {
	return movePointer(point)
}

func (r *Runtime) Click(_ context.Context, request computer.ClickRequest) error {
	return click(request)
}

func (r *Runtime) Drag(_ context.Context, request computer.DragRequest) error {
	return drag(request)
}

func (r *Runtime) Scroll(_ context.Context, request computer.ScrollRequest) error {
	return scroll(request)
}

func (r *Runtime) TypeText(_ context.Context, text string) error {
	return typeText(text)
}

func (r *Runtime) SendKey(_ context.Context, request computer.KeyRequest) error {
	return sendKey(request)
}

func (r *Runtime) ReadClipboard(_ context.Context) (computer.ClipboardContent, error) {
	return readClipboard()
}

func (r *Runtime) WriteClipboard(_ context.Context, content computer.ClipboardContent) error {
	return writeClipboard(content)
}

func (r *Runtime) FocusedElementIsSensitive(_ context.Context) (bool, error) {
	return focusedElementIsSensitive(), nil
}

func permissionState(granted bool) computer.PermissionState {
	if granted {
		return computer.PermissionStateGranted
	}
	return computer.PermissionStateDenied
}
