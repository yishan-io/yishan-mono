package computer

import "context"

type Runtime interface {
	Health(ctx context.Context) (RuntimeHealth, error)
	Permissions(ctx context.Context) (PermissionStatus, error)
	OpenPermissionSettings(ctx context.Context, permission string) error
	ListDisplays(ctx context.Context) ([]Display, error)
	ListApplications(ctx context.Context) ([]Application, error)
	ListWindows(ctx context.Context, filter WindowFilter) ([]Window, error)
	CaptureDisplay(ctx context.Context, displayID string, options CaptureOptions) (Image, error)
	CaptureWindow(ctx context.Context, windowID string, options CaptureOptions) (Image, error)
	GetAccessibilityTree(ctx context.Context, target Target, options TreeOptions) (AccessibilityNode, error)
	PerformAccessibilityAction(ctx context.Context, request AccessibilityActionRequest) error
	FocusWindow(ctx context.Context, windowID string) error
	LaunchApplication(ctx context.Context, bundleID string) error
	MovePointer(ctx context.Context, point Point) error
	Click(ctx context.Context, request ClickRequest) error
	Drag(ctx context.Context, request DragRequest) error
	Scroll(ctx context.Context, request ScrollRequest) error
	TypeText(ctx context.Context, text string) error
	SendKey(ctx context.Context, request KeyRequest) error
	ReadClipboard(ctx context.Context) (ClipboardContent, error)
	WriteClipboard(ctx context.Context, content ClipboardContent) error
}

type NoopRuntime struct {
	Platform string
	Reason   string
}

func NewUnavailableRuntime(platform string) Runtime {
	return NoopRuntime{Platform: platform, Reason: "computer runtime is unavailable on this platform"}
}

func (r NoopRuntime) Health(_ context.Context) (RuntimeHealth, error) {
	return RuntimeHealth{Available: false, Platform: r.Platform, Reason: r.Reason}, nil
}

func (r NoopRuntime) Permissions(_ context.Context) (PermissionStatus, error) {
	return PermissionStatus{
		Accessibility:   PermissionStateUnknown,
		ScreenRecording: PermissionStateUnknown,
		InputMonitoring: PermissionStateUnknown,
		Automation:      PermissionStateUnknown,
		Camera:          PermissionStateUnknown,
		FullDiskAccess:  PermissionStateUnknown,
		LocalNetwork:    PermissionStateUnknown,
		USBDevices:      PermissionStateUnknown,
		Bluetooth:       PermissionStateUnknown,
		Remediation:     []string{r.Reason},
	}, nil
}

func (r NoopRuntime) OpenPermissionSettings(_ context.Context, _ string) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}

func (r NoopRuntime) ListDisplays(context.Context) ([]Display, error) {
	return nil, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) ListApplications(context.Context) ([]Application, error) {
	return nil, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) ListWindows(context.Context, WindowFilter) ([]Window, error) {
	return nil, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) CaptureDisplay(context.Context, string, CaptureOptions) (Image, error) {
	return Image{}, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) CaptureWindow(context.Context, string, CaptureOptions) (Image, error) {
	return Image{}, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) GetAccessibilityTree(context.Context, Target, TreeOptions) (AccessibilityNode, error) {
	return AccessibilityNode{}, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) PerformAccessibilityAction(context.Context, AccessibilityActionRequest) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) FocusWindow(context.Context, string) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) LaunchApplication(context.Context, string) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) MovePointer(context.Context, Point) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) Click(context.Context, ClickRequest) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) Drag(context.Context, DragRequest) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) Scroll(context.Context, ScrollRequest) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) TypeText(context.Context, string) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) SendKey(context.Context, KeyRequest) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) ReadClipboard(context.Context) (ClipboardContent, error) {
	return ClipboardContent{}, NewError(ErrorCodeUnavailable, r.Reason)
}
func (r NoopRuntime) WriteClipboard(context.Context, ClipboardContent) error {
	return NewError(ErrorCodeUnavailable, r.Reason)
}
