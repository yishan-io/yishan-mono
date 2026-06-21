package computer

type PermissionState string

const (
	PermissionStateGranted     PermissionState = "granted"
	PermissionStateDenied      PermissionState = "denied"
	PermissionStateUnknown     PermissionState = "unknown"
	PermissionStateNotRequired PermissionState = "notRequired"
)

type RuntimeHealth struct {
	Available bool   `json:"available"`
	Platform  string `json:"platform"`
	Reason    string `json:"reason,omitempty"`
}

type PermissionStatus struct {
	Accessibility   PermissionState `json:"accessibility"`
	ScreenRecording PermissionState `json:"screenRecording"`
	InputMonitoring PermissionState `json:"inputMonitoring"`
	Automation      PermissionState `json:"automation"`
	Prompted        bool            `json:"prompted,omitempty"`
	Remediation     []string        `json:"remediation,omitempty"`
}

type Display struct {
	ID          string  `json:"id"`
	NativeID    uint32  `json:"nativeId,omitempty"`
	Name        string  `json:"name,omitempty"`
	Bounds      Rect    `json:"bounds"`
	ScaleFactor float64 `json:"scaleFactor,omitempty"`
	Primary     bool    `json:"primary,omitempty"`
}

type Application struct {
	ID         string `json:"id"`
	NativeID   int    `json:"nativeId,omitempty"`
	PID        int    `json:"pid"`
	BundleID   string `json:"bundleId,omitempty"`
	Name       string `json:"name"`
	Frontmost  bool   `json:"frontmost,omitempty"`
	LaunchedAt string `json:"launchedAt,omitempty"`
}

type Window struct {
	ID          string `json:"id"`
	NativeID    uint32 `json:"nativeId,omitempty"`
	PID         int    `json:"pid"`
	BundleID    string `json:"bundleId,omitempty"`
	Application string `json:"application,omitempty"`
	Title       string `json:"title,omitempty"`
	Bounds      Rect   `json:"bounds"`
	DisplayID   string `json:"displayId,omitempty"`
	Visible     bool   `json:"visible"`
	Frontmost   bool   `json:"frontmost,omitempty"`
	Layer       int    `json:"layer,omitempty"`
}

type WindowFilter struct {
	PID            int    `json:"pid,omitempty"`
	BundleID       string `json:"bundleId,omitempty"`
	Title          string `json:"title,omitempty"`
	VisibleOnly    bool   `json:"visibleOnly,omitempty"`
	ExcludeDesktop bool   `json:"excludeDesktop,omitempty"`
	FrontmostOnly  bool   `json:"frontmostOnly,omitempty"`
	IncludeLayer   *int   `json:"includeLayer,omitempty"`
}

type CaptureOptions struct {
	Format        string `json:"format,omitempty"`
	MaxWidth      int    `json:"maxWidth,omitempty"`
	MaxHeight     int    `json:"maxHeight,omitempty"`
	IncludeCursor bool   `json:"includeCursor,omitempty"`
	Region        *Rect  `json:"region,omitempty"`
}

type Image struct {
	MimeType    string `json:"mimeType"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	ScaleFactor int    `json:"scaleFactor,omitempty"`
	CapturedAt  string `json:"capturedAt,omitempty"`
	DataBase64  string `json:"dataBase64,omitempty"`
	TempFile    string `json:"tempFile,omitempty"`
}

type TreeOptions struct {
	MaxDepth        int  `json:"maxDepth,omitempty"`
	MaxNodes        int  `json:"maxNodes,omitempty"`
	RedactSensitive bool `json:"redactSensitive,omitempty"`
}

type Target struct {
	ApplicationID string `json:"applicationId,omitempty"`
	WindowID      string `json:"windowId,omitempty"`
	ElementID     string `json:"elementId,omitempty"`
	PID           int    `json:"pid,omitempty"`
}

type AccessibilityNode struct {
	ID          string              `json:"id"`
	Role        string              `json:"role,omitempty"`
	Subrole     string              `json:"subrole,omitempty"`
	Title       string              `json:"title,omitempty"`
	Description string              `json:"description,omitempty"`
	Value       string              `json:"value,omitempty"`
	Enabled     bool                `json:"enabled,omitempty"`
	Focused     bool                `json:"focused,omitempty"`
	Selected    bool                `json:"selected,omitempty"`
	Frame       Rect                `json:"frame"`
	Actions     []string            `json:"actions,omitempty"`
	Children    []AccessibilityNode `json:"children,omitempty"`
	Sensitive   bool                `json:"sensitive,omitempty"`
}

type AccessibilityActionRequest struct {
	ElementID string `json:"elementId"`
	Action    string `json:"action"`
	Value     string `json:"value,omitempty"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Rect struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type ClickRequest struct {
	Point  Point  `json:"point"`
	Button string `json:"button,omitempty"`
	Count  int    `json:"count,omitempty"`
}

type DragRequest struct {
	From Point `json:"from"`
	To   Point `json:"to"`
}

type ScrollRequest struct {
	Point      Point `json:"point,omitempty"`
	DeltaX     int   `json:"deltaX,omitempty"`
	DeltaY     int   `json:"deltaY,omitempty"`
	Continuous bool  `json:"continuous,omitempty"`
}

type KeyRequest struct {
	Key       string   `json:"key"`
	Modifiers []string `json:"modifiers,omitempty"`
	Down      bool     `json:"down,omitempty"`
	Up        bool     `json:"up,omitempty"`
}

type ClipboardContent struct {
	Text    string `json:"text,omitempty"`
	HasText bool   `json:"hasText,omitempty"`
	Type    string `json:"type,omitempty"`
}

type FeatureConfig struct {
	Enabled            bool `json:"enabled"`
	Observe            bool `json:"observe"`
	Capture            bool `json:"capture"`
	Inspect            bool `json:"inspect"`
	Actions            bool `json:"actions"`
	Mouse              bool `json:"mouse"`
	Keyboard           bool `json:"keyboard"`
	ClipboardRead      bool `json:"clipboardRead"`
	ClipboardWrite     bool `json:"clipboardWrite"`
	ApplicationControl bool `json:"applicationControl"`
}
