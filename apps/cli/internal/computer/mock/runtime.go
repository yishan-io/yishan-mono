package mock

import (
	"context"

	"yishan/apps/cli/internal/computer"
)

type Runtime struct {
	HealthFunc                 func(ctx context.Context) (computer.RuntimeHealth, error)
	PermissionsFunc            func(ctx context.Context) (computer.PermissionStatus, error)
	OpenPermissionSettingsFunc func(ctx context.Context, permission string) error
	ListDisplaysFunc           func(ctx context.Context) ([]computer.Display, error)
	ListApplicationsFunc       func(ctx context.Context) ([]computer.Application, error)
	ListWindowsFunc            func(ctx context.Context, filter computer.WindowFilter) ([]computer.Window, error)
	CaptureDisplayFunc         func(ctx context.Context, displayID string, options computer.CaptureOptions) (computer.Image, error)
	CaptureWindowFunc          func(ctx context.Context, windowID string, options computer.CaptureOptions) (computer.Image, error)
	GetAccessibilityTreeFunc   func(ctx context.Context, target computer.Target, options computer.TreeOptions) (computer.AccessibilityNode, error)
	PerformAXActionFunc        func(ctx context.Context, request computer.AccessibilityActionRequest) error
	FocusWindowFunc            func(ctx context.Context, windowID string) error
	LaunchApplicationFunc      func(ctx context.Context, bundleID string) error
	MovePointerFunc            func(ctx context.Context, point computer.Point) error
	ClickFunc                  func(ctx context.Context, request computer.ClickRequest) error
	DragFunc                   func(ctx context.Context, request computer.DragRequest) error
	ScrollFunc                 func(ctx context.Context, request computer.ScrollRequest) error
	TypeTextFunc               func(ctx context.Context, text string) error
	SendKeyFunc                func(ctx context.Context, request computer.KeyRequest) error
	ReadClipboardFunc          func(ctx context.Context) (computer.ClipboardContent, error)
	WriteClipboardFunc         func(ctx context.Context, content computer.ClipboardContent) error
}

func (r Runtime) Health(ctx context.Context) (computer.RuntimeHealth, error) {
	if r.HealthFunc != nil {
		return r.HealthFunc(ctx)
	}
	return computer.RuntimeHealth{Available: true, Platform: "mock"}, nil
}

func (r Runtime) Permissions(ctx context.Context) (computer.PermissionStatus, error) {
	if r.PermissionsFunc != nil {
		return r.PermissionsFunc(ctx)
	}
	return computer.PermissionStatus{
		Accessibility:   computer.PermissionStateGranted,
		ScreenRecording: computer.PermissionStateGranted,
		InputMonitoring: computer.PermissionStateGranted,
		Automation:      computer.PermissionStateNotRequired,
		Camera:          computer.PermissionStateNotRequested,
		FullDiskAccess:  computer.PermissionStateCheckManually,
		LocalNetwork:    computer.PermissionStateCheckManually,
		USBDevices:      computer.PermissionStateEntitled,
		Bluetooth:       computer.PermissionStateEntitled,
	}, nil
}

func (r Runtime) OpenPermissionSettings(ctx context.Context, permission string) error {
	if r.OpenPermissionSettingsFunc != nil {
		return r.OpenPermissionSettingsFunc(ctx, permission)
	}
	return nil
}

func (r Runtime) ListDisplays(ctx context.Context) ([]computer.Display, error) {
	if r.ListDisplaysFunc != nil {
		return r.ListDisplaysFunc(ctx)
	}
	return nil, nil
}

func (r Runtime) ListApplications(ctx context.Context) ([]computer.Application, error) {
	if r.ListApplicationsFunc != nil {
		return r.ListApplicationsFunc(ctx)
	}
	return nil, nil
}

func (r Runtime) ListWindows(ctx context.Context, filter computer.WindowFilter) ([]computer.Window, error) {
	if r.ListWindowsFunc != nil {
		return r.ListWindowsFunc(ctx, filter)
	}
	return nil, nil
}

func (r Runtime) CaptureDisplay(ctx context.Context, displayID string, options computer.CaptureOptions) (computer.Image, error) {
	if r.CaptureDisplayFunc != nil {
		return r.CaptureDisplayFunc(ctx, displayID, options)
	}
	return computer.Image{}, nil
}

func (r Runtime) CaptureWindow(ctx context.Context, windowID string, options computer.CaptureOptions) (computer.Image, error) {
	if r.CaptureWindowFunc != nil {
		return r.CaptureWindowFunc(ctx, windowID, options)
	}
	return computer.Image{}, nil
}
func (r Runtime) GetAccessibilityTree(ctx context.Context, target computer.Target, options computer.TreeOptions) (computer.AccessibilityNode, error) {
	if r.GetAccessibilityTreeFunc != nil {
		return r.GetAccessibilityTreeFunc(ctx, target, options)
	}
	return computer.AccessibilityNode{}, nil
}
func (r Runtime) PerformAccessibilityAction(ctx context.Context, request computer.AccessibilityActionRequest) error {
	if r.PerformAXActionFunc != nil {
		return r.PerformAXActionFunc(ctx, request)
	}
	return nil
}
func (r Runtime) FocusWindow(ctx context.Context, windowID string) error {
	if r.FocusWindowFunc != nil {
		return r.FocusWindowFunc(ctx, windowID)
	}
	return nil
}
func (r Runtime) LaunchApplication(ctx context.Context, bundleID string) error {
	if r.LaunchApplicationFunc != nil {
		return r.LaunchApplicationFunc(ctx, bundleID)
	}
	return nil
}
func (r Runtime) MovePointer(ctx context.Context, point computer.Point) error {
	if r.MovePointerFunc != nil {
		return r.MovePointerFunc(ctx, point)
	}
	return nil
}
func (r Runtime) Click(ctx context.Context, request computer.ClickRequest) error {
	if r.ClickFunc != nil {
		return r.ClickFunc(ctx, request)
	}
	return nil
}
func (r Runtime) Drag(ctx context.Context, request computer.DragRequest) error {
	if r.DragFunc != nil {
		return r.DragFunc(ctx, request)
	}
	return nil
}
func (r Runtime) Scroll(ctx context.Context, request computer.ScrollRequest) error {
	if r.ScrollFunc != nil {
		return r.ScrollFunc(ctx, request)
	}
	return nil
}
func (r Runtime) TypeText(ctx context.Context, text string) error {
	if r.TypeTextFunc != nil {
		return r.TypeTextFunc(ctx, text)
	}
	return nil
}
func (r Runtime) SendKey(ctx context.Context, request computer.KeyRequest) error {
	if r.SendKeyFunc != nil {
		return r.SendKeyFunc(ctx, request)
	}
	return nil
}
func (r Runtime) ReadClipboard(ctx context.Context) (computer.ClipboardContent, error) {
	if r.ReadClipboardFunc != nil {
		return r.ReadClipboardFunc(ctx)
	}
	return computer.ClipboardContent{}, nil
}
func (r Runtime) WriteClipboard(ctx context.Context, content computer.ClipboardContent) error {
	if r.WriteClipboardFunc != nil {
		return r.WriteClipboardFunc(ctx, content)
	}
	return nil
}
