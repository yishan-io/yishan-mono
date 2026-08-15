package daemon

import (
	"context"
	"strings"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// ComputerService implementation: each method performs one computer-use
// operation. A missing service is a server error.

func (h *JSONRPCHandler) computerServiceOrError() (*computer.Service, error) {
	if h.computer == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "computer service not available")
	}
	return h.computer, nil
}

func (h *JSONRPCHandler) ComputerHealth(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Health(ctx)
}

func (h *JSONRPCHandler) ComputerPermissions(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Permissions(ctx)
}

func (h *JSONRPCHandler) ComputerGetConfig(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.Config(), nil
}

func (h *JSONRPCHandler) ComputerUpdateConfig(ctx context.Context, req computer.FeatureConfig) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	svc.UpdateConfig(req)
	if h.settingsPath != "" {
		if err := config.UpdateSettings(h.settingsPath, func(v *viper.Viper) {
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
			return nil, workspace.NewRPCError(rpcCodeServerError, "persist computer config: "+err.Error())
		}
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerListDisplays(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListDisplays(ctx)
}

func (h *JSONRPCHandler) ComputerListApplications(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListApplications(ctx)
}

func (h *JSONRPCHandler) ComputerListWindows(ctx context.Context, req rpc.ComputerListWindowsParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ListWindows(ctx, req.Filter)
}

func (h *JSONRPCHandler) ComputerCaptureDisplay(ctx context.Context, req rpc.ComputerCaptureDisplayParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.DisplayID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "displayId is required")
	}
	return svc.CaptureDisplay(ctx, strings.TrimSpace(req.DisplayID), req.Options)
}

func (h *JSONRPCHandler) ComputerCaptureWindow(ctx context.Context, req rpc.ComputerCaptureWindowParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "windowId is required")
	}
	return svc.CaptureWindow(ctx, strings.TrimSpace(req.WindowID), req.Options)
}

func (h *JSONRPCHandler) ComputerGetUITree(ctx context.Context, req rpc.ComputerGetUITreeParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.GetAccessibilityTree(ctx, req.Target, req.Options)
}

func (h *JSONRPCHandler) ComputerPerformAction(ctx context.Context, req computer.AccessibilityActionRequest) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.ElementID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "elementId is required")
	}
	if strings.TrimSpace(req.Action) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "action is required")
	}
	if err := svc.PerformAccessibilityAction(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerFocusWindow(ctx context.Context, req rpc.ComputerFocusWindowParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.WindowID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "windowId is required")
	}
	if err := svc.FocusWindow(ctx, strings.TrimSpace(req.WindowID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerLaunchApplication(ctx context.Context, req rpc.ComputerLaunchApplicationParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.BundleID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "bundleId is required")
	}
	if err := svc.LaunchApplication(ctx, strings.TrimSpace(req.BundleID)); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerMovePointer(ctx context.Context, req rpc.ComputerMovePointerParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.MovePointer(ctx, req.Point); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerClick(ctx context.Context, req computer.ClickRequest) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Click(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerDrag(ctx context.Context, req computer.DragRequest) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Drag(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerScroll(ctx context.Context, req computer.ScrollRequest) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.Scroll(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerTypeText(ctx context.Context, req rpc.ComputerTypeTextParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Text) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "text is required")
	}
	if err := svc.TypeText(ctx, req.Text); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerSendKey(ctx context.Context, req computer.KeyRequest) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "key is required")
	}
	if err := svc.SendKey(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerReadClipboard(ctx context.Context) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	return svc.ReadClipboard(ctx)
}

func (h *JSONRPCHandler) ComputerWriteClipboard(ctx context.Context, req computer.ClipboardContent) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	if err := svc.WriteClipboard(ctx, req); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

func (h *JSONRPCHandler) ComputerOpenPermissionSettings(ctx context.Context, req rpc.ComputerOpenPermissionSettingsParams) (any, error) {
	svc, err := h.computerServiceOrError()
	if err != nil {
		return nil, err
	}
	permission := strings.TrimSpace(req.Permission)
	if permission == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "permission is required")
	}
	if err := svc.OpenPermissionSettings(ctx, permission); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}
