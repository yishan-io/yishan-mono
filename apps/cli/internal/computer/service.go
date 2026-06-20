package computer

import (
	"context"
	"fmt"
	"strings"
)

type sensitiveTargetRuntime interface {
	FocusedElementIsSensitive(ctx context.Context) (bool, error)
}

type Service struct {
	runtime            Runtime
	audit              *AuditLog
	maxTypedCharacters int
}

func NewService(runtime Runtime) *Service {
	return &Service{runtime: runtime, audit: &AuditLog{}, maxTypedCharacters: 10000}
}

func (s *Service) AuditEvents() []AuditEvent {
	return s.audit.Snapshot()
}

func (s *Service) Health(ctx context.Context) (RuntimeHealth, error) { return s.runtime.Health(ctx) }
func (s *Service) Permissions(ctx context.Context) (PermissionStatus, error) {
	return s.runtime.Permissions(ctx)
}
func (s *Service) OpenPermissionSettings(ctx context.Context, permission string) error {
	return s.runtime.OpenPermissionSettings(ctx, permission)
}
func (s *Service) ListDisplays(ctx context.Context) ([]Display, error) {
	return s.runtime.ListDisplays(ctx)
}
func (s *Service) ListApplications(ctx context.Context) ([]Application, error) {
	return s.runtime.ListApplications(ctx)
}
func (s *Service) ListWindows(ctx context.Context, filter WindowFilter) ([]Window, error) {
	return s.runtime.ListWindows(ctx, filter)
}
func (s *Service) CaptureDisplay(ctx context.Context, displayID string, options CaptureOptions) (Image, error) {
	return s.runtime.CaptureDisplay(ctx, displayID, options)
}
func (s *Service) CaptureWindow(ctx context.Context, windowID string, options CaptureOptions) (Image, error) {
	return s.runtime.CaptureWindow(ctx, windowID, options)
}
func (s *Service) GetAccessibilityTree(ctx context.Context, target Target, options TreeOptions) (AccessibilityNode, error) {
	return s.runtime.GetAccessibilityTree(ctx, target, options)
}

func (s *Service) PerformAccessibilityAction(ctx context.Context, request AccessibilityActionRequest) error {
	bundleID, _ := s.bundleIDForElementID(ctx, request.ElementID)
	if strings.TrimSpace(bundleID) == "" {
		s.audit.Add(AuditEvent{Operation: "accessibility.action", Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeTargetNotFound)})
		return NewErrorWithDetails(ErrorCodeTargetNotFound, "target element was not found", map[string]any{"elementId": request.ElementID}, false)
	}
	return s.runMutation(ctx, "accessibility.action", bundleID, "", func() error {
		return s.runtime.PerformAccessibilityAction(ctx, request)
	})
}

func (s *Service) FocusWindow(ctx context.Context, windowID string) error {
	bundleID, title := s.bundleIDForWindowID(ctx, windowID)
	if strings.TrimSpace(bundleID) == "" {
		s.audit.Add(AuditEvent{Operation: "window.focus", Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeTargetNotFound)})
		return NewErrorWithDetails(ErrorCodeTargetNotFound, "target window was not found", map[string]any{"windowId": windowID}, false)
	}
	return s.runMutation(ctx, "window.focus", bundleID, title, func() error {
		return s.runtime.FocusWindow(ctx, windowID)
	})
}

func (s *Service) LaunchApplication(ctx context.Context, bundleID string) error {
	return s.runMutation(ctx, "application.launch", bundleID, "", func() error {
		return s.runtime.LaunchApplication(ctx, bundleID)
	})
}

func (s *Service) MovePointer(ctx context.Context, point Point) error {
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "pointer.move", bundleID, "", func() error {
		return s.runtime.MovePointer(ctx, point)
	})
}

func (s *Service) Click(ctx context.Context, request ClickRequest) error {
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "pointer.click", bundleID, "", func() error {
		return s.runtime.Click(ctx, request)
	})
}

func (s *Service) Drag(ctx context.Context, request DragRequest) error {
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "pointer.drag", bundleID, "", func() error {
		return s.runtime.Drag(ctx, request)
	})
}

func (s *Service) Scroll(ctx context.Context, request ScrollRequest) error {
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "pointer.scroll", bundleID, "", func() error {
		return s.runtime.Scroll(ctx, request)
	})
}

func (s *Service) TypeText(ctx context.Context, text string) error {
	if len(text) > s.maxTypedCharacters {
		s.audit.Add(AuditEvent{Operation: "keyboard.type", Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeRateLimited)})
		return NewErrorWithDetails(ErrorCodeRateLimited, "typed text exceeds limit", map[string]any{"limit": s.maxTypedCharacters}, false)
	}
	if s.focusedElementIsSensitive(ctx) {
		s.audit.Add(AuditEvent{Operation: "keyboard.type", Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeSensitiveTarget)})
		return NewError(ErrorCodeSensitiveTarget, "typing into a secure text field is blocked")
	}
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "keyboard.type", bundleID, "", func() error {
		return s.runtime.TypeText(ctx, text)
	})
}

func (s *Service) SendKey(ctx context.Context, request KeyRequest) error {
	if s.focusedElementIsSensitive(ctx) {
		s.audit.Add(AuditEvent{Operation: "keyboard.key", Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeSensitiveTarget)})
		return NewError(ErrorCodeSensitiveTarget, "keyboard input into a secure text field is blocked")
	}
	bundleID := s.frontmostBundleID(ctx)
	return s.runMutation(ctx, "keyboard.key", bundleID, "", func() error {
		return s.runtime.SendKey(ctx, request)
	})
}

func (s *Service) ReadClipboard(ctx context.Context) (ClipboardContent, error) {
	if !ApprovalFromContext(ctx) {
		s.audit.Add(AuditEvent{Operation: "clipboard.read", Decision: "approval_required", Result: "denied", ErrorCode: string(ErrorCodeApprovalRequired)})
		return ClipboardContent{}, NewError(ErrorCodeApprovalRequired, "clipboard read requires approval")
	}
	content, err := s.runtime.ReadClipboard(ctx)
	if err != nil {
		s.audit.Add(AuditEvent{Operation: "clipboard.read", Decision: "approved", Result: "error", ErrorCode: errorCodeString(err)})
		return ClipboardContent{}, err
	}
	s.audit.Add(AuditEvent{Operation: "clipboard.read", Decision: "approved", Result: "success"})
	return content, nil
}

func (s *Service) WriteClipboard(ctx context.Context, content ClipboardContent) error {
	if !ApprovalFromContext(ctx) {
		s.audit.Add(AuditEvent{Operation: "clipboard.write", Decision: "approval_required", Result: "denied", ErrorCode: string(ErrorCodeApprovalRequired)})
		return NewError(ErrorCodeApprovalRequired, "clipboard write requires approval")
	}
	err := s.runtime.WriteClipboard(ctx, content)
	if err != nil {
		s.audit.Add(AuditEvent{Operation: "clipboard.write", Decision: "approved", Result: "error", ErrorCode: errorCodeString(err)})
		return err
	}
	s.audit.Add(AuditEvent{Operation: "clipboard.write", Decision: "approved", Result: "success"})
	return nil
}

func (s *Service) runMutation(ctx context.Context, operation string, bundleID string, targetWindow string, fn func() error) error {
	bundleID = strings.TrimSpace(bundleID)
	if bundleID == "" {
		s.audit.Add(AuditEvent{Operation: operation, Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeApplicationBlocked)})
		return NewError(ErrorCodeApplicationBlocked, "target application is not allowed")
	}
	if isBlockedBundleID(bundleID) {
		s.audit.Add(AuditEvent{Operation: operation, TargetApplication: bundleID, Decision: "denied", Result: "error", ErrorCode: string(ErrorCodeApplicationBlocked)})
		return NewErrorWithDetails(ErrorCodeApplicationBlocked, "target application is blocked", map[string]any{"bundleId": bundleID}, false)
	}
	if !ApprovalFromContext(ctx) {
		s.audit.Add(AuditEvent{Operation: operation, TargetApplication: bundleID, TargetWindow: targetWindow, Decision: "approval_required", Result: "denied", ErrorCode: string(ErrorCodeApprovalRequired)})
		return NewError(ErrorCodeApprovalRequired, fmt.Sprintf("%s requires approval", operation))
	}
	err := fn()
	if err != nil {
		s.audit.Add(AuditEvent{Operation: operation, TargetApplication: bundleID, TargetWindow: targetWindow, Decision: "approved", Result: "error", ErrorCode: errorCodeString(err)})
		return err
	}
	s.audit.Add(AuditEvent{Operation: operation, TargetApplication: bundleID, TargetWindow: targetWindow, Decision: "approved", Result: "success"})
	return nil
}

func (s *Service) frontmostBundleID(ctx context.Context) string {
	applications, err := s.runtime.ListApplications(ctx)
	if err != nil {
		return ""
	}
	for _, application := range applications {
		if application.Frontmost {
			return application.BundleID
		}
	}
	return ""
}

func (s *Service) bundleIDForWindowID(ctx context.Context, windowID string) (string, string) {
	windows, err := s.runtime.ListWindows(ctx, WindowFilter{})
	if err != nil {
		return "", ""
	}
	for _, window := range windows {
		if window.ID == windowID {
			return window.BundleID, window.Title
		}
	}
	return "", ""
}

func (s *Service) bundleIDForElementID(ctx context.Context, elementID string) (string, string) {
	pidPart := strings.SplitN(strings.TrimPrefix(elementID, "ax_"), "_", 2)
	if len(pidPart) == 0 {
		return "", ""
	}
	applications, err := s.runtime.ListApplications(ctx)
	if err != nil {
		return "", ""
	}
	for _, application := range applications {
		if fmt.Sprintf("%d", application.PID) == pidPart[0] {
			return application.BundleID, application.Name
		}
	}
	return "", ""
}

func (s *Service) focusedElementIsSensitive(ctx context.Context) bool {
	detector, ok := s.runtime.(sensitiveTargetRuntime)
	if !ok {
		return false
	}
	sensitive, err := detector.FocusedElementIsSensitive(ctx)
	return err == nil && sensitive
}

func errorCodeString(err error) string {
	if typed, ok := err.(*Error); ok {
		return string(typed.Code)
	}
	return "error"
}
