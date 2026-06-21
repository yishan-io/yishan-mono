package daemon

import (
	"context"

	"yishan/apps/cli/internal/computer"
)

type computerService struct {
	service *computer.Service
}

func newComputerService(runtime computer.Runtime) *computerService {
	return &computerService{service: computer.NewService(runtime)}
}

func newDefaultComputerService() *computerService {
	return newComputerService(newComputerRuntime())
}

func (s *computerService) Health(ctx context.Context) (computer.RuntimeHealth, error) {
	return s.service.Health(ctx)
}

func (s *computerService) Permissions(ctx context.Context) (computer.PermissionStatus, error) {
	return s.service.Permissions(ctx)
}

func (s *computerService) OpenPermissionSettings(ctx context.Context, permission string) error {
	return s.service.OpenPermissionSettings(ctx, permission)
}

func (s *computerService) ListDisplays(ctx context.Context) ([]computer.Display, error) {
	return s.service.ListDisplays(ctx)
}

func (s *computerService) ListApplications(ctx context.Context) ([]computer.Application, error) {
	return s.service.ListApplications(ctx)
}

func (s *computerService) ListWindows(ctx context.Context, filter computer.WindowFilter) ([]computer.Window, error) {
	return s.service.ListWindows(ctx, filter)
}

func (s *computerService) CaptureDisplay(ctx context.Context, displayID string, options computer.CaptureOptions) (computer.Image, error) {
	return s.service.CaptureDisplay(ctx, displayID, options)
}

func (s *computerService) CaptureWindow(ctx context.Context, windowID string, options computer.CaptureOptions) (computer.Image, error) {
	return s.service.CaptureWindow(ctx, windowID, options)
}

func (s *computerService) GetAccessibilityTree(ctx context.Context, target computer.Target, options computer.TreeOptions) (computer.AccessibilityNode, error) {
	return s.service.GetAccessibilityTree(ctx, target, options)
}

func (s *computerService) PerformAccessibilityAction(ctx context.Context, request computer.AccessibilityActionRequest) error {
	return s.service.PerformAccessibilityAction(ctx, request)
}

func (s *computerService) FocusWindow(ctx context.Context, windowID string) error {
	return s.service.FocusWindow(ctx, windowID)
}

func (s *computerService) LaunchApplication(ctx context.Context, bundleID string) error {
	return s.service.LaunchApplication(ctx, bundleID)
}

func (s *computerService) MovePointer(ctx context.Context, point computer.Point) error {
	return s.service.MovePointer(ctx, point)
}

func (s *computerService) Click(ctx context.Context, request computer.ClickRequest) error {
	return s.service.Click(ctx, request)
}

func (s *computerService) Drag(ctx context.Context, request computer.DragRequest) error {
	return s.service.Drag(ctx, request)
}

func (s *computerService) Scroll(ctx context.Context, request computer.ScrollRequest) error {
	return s.service.Scroll(ctx, request)
}

func (s *computerService) TypeText(ctx context.Context, text string) error {
	return s.service.TypeText(ctx, text)
}

func (s *computerService) SendKey(ctx context.Context, request computer.KeyRequest) error {
	return s.service.SendKey(ctx, request)
}

func (s *computerService) ReadClipboard(ctx context.Context) (computer.ClipboardContent, error) {
	return s.service.ReadClipboard(ctx)
}

func (s *computerService) WriteClipboard(ctx context.Context, content computer.ClipboardContent) error {
	return s.service.WriteClipboard(ctx, content)
}

func (s *computerService) Config() computer.FeatureConfig {
	return s.service.Config()
}

func (s *computerService) UpdateConfig(config computer.FeatureConfig) {
	s.service.UpdateConfig(config)
}
