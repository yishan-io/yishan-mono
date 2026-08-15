package node

import (
	"context"
	"strings"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
)

// ComputerService implementation: each method performs one computer-use
// operation. A missing service is a server error.

func (s *Services) computerServiceOrError() (*computer.Service, error) {
	if s.computer == nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "computer service not available")
	}
	return s.computer, nil
}

func (s *Services) ComputerHealth(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Health(ctx)
}

func (s *Services) ComputerPermissions(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Permissions(ctx)
}

func (s *Services) ComputerGetConfig(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Config(), nil
}

func (s *Services) ComputerUpdateConfig(ctx context.Context, req computer.FeatureConfig) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	svc.UpdateConfig(req)
	if s.settingsPath != "" {
		if err := config.UpdateSettings(s.settingsPath, func(v *viper.Viper) {
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
			return nil, workspace.NewRPCError(rpcerror.CodeServerError, "persist computer config: "+err.Error())
		}
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerListDisplays(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListDisplays(ctx)
}

func (s *Services) ComputerListApplications(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListApplications(ctx)
}

func (s *Services) ComputerListWindows(ctx context.Context, req rpc.ComputerListWindowsParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListWindows(ctx, req.Filter)
}

func (s *Services) ComputerCaptureDisplay(ctx context.Context, req rpc.ComputerCaptureDisplayParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.DisplayID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "displayId is required")
	}
	return svc.CaptureDisplay(ctx, strings.TrimSpace(req.DisplayID), req.Options)
}

func (s *Services) ComputerCaptureWindow(ctx context.Context, req rpc.ComputerCaptureWindowParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "windowId is required")
	}
	return svc.CaptureWindow(ctx, strings.TrimSpace(req.WindowID), req.Options)
}

func (s *Services) ComputerGetUITree(ctx context.Context, req rpc.ComputerGetUITreeParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.GetAccessibilityTree(ctx, req.Target, req.Options)
}

func (s *Services) ComputerPerformAction(ctx context.Context, req computer.AccessibilityActionRequest) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ElementID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "elementId is required")
	}
	if strings.TrimSpace(req.Action) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "action is required")
	}
	if err := svc.PerformAccessibilityAction(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerFocusWindow(ctx context.Context, req rpc.ComputerFocusWindowParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "windowId is required")
	}
	if err := svc.FocusWindow(ctx, strings.TrimSpace(req.WindowID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerLaunchApplication(ctx context.Context, req rpc.ComputerLaunchApplicationParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.BundleID) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "bundleId is required")
	}
	if err := svc.LaunchApplication(ctx, strings.TrimSpace(req.BundleID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerMovePointer(ctx context.Context, req rpc.ComputerMovePointerParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.MovePointer(ctx, req.Point); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerClick(ctx context.Context, req computer.ClickRequest) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Click(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerDrag(ctx context.Context, req computer.DragRequest) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Drag(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerScroll(ctx context.Context, req computer.ScrollRequest) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Scroll(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerTypeText(ctx context.Context, req rpc.ComputerTypeTextParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Text) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "text is required")
	}
	if err := svc.TypeText(ctx, req.Text); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerSendKey(ctx context.Context, req computer.KeyRequest) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "key is required")
	}
	if err := svc.SendKey(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerReadClipboard(ctx context.Context) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ReadClipboard(ctx)
}

func (s *Services) ComputerWriteClipboard(ctx context.Context, req computer.ClipboardContent) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.WriteClipboard(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (s *Services) ComputerOpenPermissionSettings(ctx context.Context, req rpc.ComputerOpenPermissionSettingsParams) (any, error) {
	svc, err := s.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	permission := strings.TrimSpace(req.Permission)
	if permission == "" {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, "permission is required")
	}
	if err := svc.OpenPermissionSettings(ctx, permission); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}
