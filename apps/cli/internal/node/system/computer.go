package system

import (
	"context"
	"strings"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

// ComputerService implementation: each method performs one computer-use
// operation. A missing service is a server error.

func (s *Service) computerService() (*computer.Service, error) {
	if s.deps.Computer == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "computer service not available")
	}
	return s.deps.Computer, nil
}

func (s *Service) Health(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.Health(ctx)
}

func (s *Service) Permissions(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.Permissions(ctx)
}

func (s *Service) GetConfig(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.Config(), nil
}

func (s *Service) UpdateConfig(ctx context.Context, req computer.FeatureConfig) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	svc.UpdateConfig(req)
	if s.deps.SettingsPath != "" {
		if err := config.UpdateSettings(s.deps.SettingsPath, func(v *viper.Viper) {
			v.Set("computer_use.enabled", req.Enabled)
			v.Set("computer_use.observe", req.Observe)
			v.Set("computer_use.capture", req.Capture)
			v.Set("computer_use.inspect", req.Inspect)
			v.Set("computer_use.actions", req.Actions)
			v.Set("computer_use.mouse", req.Mouse)
			v.Set("computer_use.keyboard", req.Keyboard)
			v.Set("computer_use.clipboard_read", req.ClipboardRead)
			v.Set("computer_use.clipboard_write", req.ClipboardWrite)
			v.Set("computer_use.application_control", req.ApplicationControl)
		}); err != nil {
			return nil, rpc.NewRPCError(rpc.CodeServerError, "persist computer config: "+err.Error())
		}
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) ListDisplays(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.ListDisplays(ctx)
}

func (s *Service) ListApplications(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.ListApplications(ctx)
}

func (s *Service) ListWindows(ctx context.Context, req rpc.ComputerListWindowsParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.ListWindows(ctx, req.Filter)
}

func (s *Service) CaptureDisplay(ctx context.Context, req rpc.ComputerCaptureDisplayParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.DisplayID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "displayId is required")
	}
	return svc.CaptureDisplay(ctx, strings.TrimSpace(req.DisplayID), req.Options)
}

func (s *Service) CaptureWindow(ctx context.Context, req rpc.ComputerCaptureWindowParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "windowId is required")
	}
	return svc.CaptureWindow(ctx, strings.TrimSpace(req.WindowID), req.Options)
}

func (s *Service) GetUITree(ctx context.Context, req rpc.ComputerGetUITreeParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.GetAccessibilityTree(ctx, req.Target, req.Options)
}

func (s *Service) PerformAction(ctx context.Context, req computer.AccessibilityActionRequest) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ElementID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "elementId is required")
	}
	if strings.TrimSpace(req.Action) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "action is required")
	}
	if err := svc.PerformAccessibilityAction(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) FocusWindow(ctx context.Context, req rpc.ComputerFocusWindowParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "windowId is required")
	}
	if err := svc.FocusWindow(ctx, strings.TrimSpace(req.WindowID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) LaunchApplication(ctx context.Context, req rpc.ComputerLaunchApplicationParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.BundleID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "bundleId is required")
	}
	if err := svc.LaunchApplication(ctx, strings.TrimSpace(req.BundleID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) MovePointer(ctx context.Context, req rpc.ComputerMovePointerParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if err := svc.MovePointer(ctx, req.Point); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) Click(ctx context.Context, req computer.ClickRequest) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if err := svc.Click(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) Drag(ctx context.Context, req computer.DragRequest) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if err := svc.Drag(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) Scroll(ctx context.Context, req computer.ScrollRequest) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if err := svc.Scroll(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) TypeText(ctx context.Context, req rpc.ComputerTypeTextParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Text) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "text is required")
	}
	if err := svc.TypeText(ctx, req.Text); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) SendKey(ctx context.Context, req computer.KeyRequest) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "key is required")
	}
	if err := svc.SendKey(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) ReadClipboard(ctx context.Context) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	return svc.ReadClipboard(ctx)
}

func (s *Service) WriteClipboard(ctx context.Context, req computer.ClipboardContent) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	if err := svc.WriteClipboard(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Service) OpenPermissionSettings(ctx context.Context, req rpc.ComputerOpenPermissionSettingsParams) (any, error) {
	svc, err := s.computerService()
	if err != nil {
		return nil, err
	}
	permission := strings.TrimSpace(req.Permission)
	if permission == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "permission is required")
	}
	if err := svc.OpenPermissionSettings(ctx, permission); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}
