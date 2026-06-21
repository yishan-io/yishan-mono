package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchComputer(ctx context.Context, method string, params json.RawMessage) (any, error) {
	if h.computer == nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "computer service not available")
	}
	ctx = withComputerApproval(ctx, params)

	switch method {
	case MethodComputerHealth:
		return h.computer.Health(ctx)
	case MethodComputerPermissions:
		return h.computer.Permissions(ctx)
	case MethodComputerGetConfig:
		return h.computer.Config(), nil
	case MethodComputerUpdateConfig:
		var req computer.FeatureConfig
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		h.computer.UpdateConfig(req)
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
	case MethodComputerListDisplays:
		return h.computer.ListDisplays(ctx)
	case MethodComputerListApplications:
		return h.computer.ListApplications(ctx)
	case MethodComputerListWindows:
		var req struct {
			Filter computer.WindowFilter `json:"filter"`
		}
		if len(params) == 0 {
			return h.computer.ListWindows(ctx, computer.WindowFilter{})
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.computer.ListWindows(ctx, req.Filter)
	case MethodComputerCaptureDisplay:
		var req struct {
			DisplayID string                  `json:"displayId"`
			Options   computer.CaptureOptions `json:"options"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.DisplayID) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "displayId is required")
		}
		return h.computer.CaptureDisplay(ctx, strings.TrimSpace(req.DisplayID), req.Options)
	case MethodComputerCaptureWindow:
		var req struct {
			WindowID string                  `json:"windowId"`
			Options  computer.CaptureOptions `json:"options"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.WindowID) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "windowId is required")
		}
		return h.computer.CaptureWindow(ctx, strings.TrimSpace(req.WindowID), req.Options)
	case MethodComputerGetUITree:
		var req struct {
			Target  computer.Target      `json:"target"`
			Options computer.TreeOptions `json:"options"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.computer.GetAccessibilityTree(ctx, req.Target, req.Options)
	case MethodComputerPerformAction:
		var req computer.AccessibilityActionRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.ElementID) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "elementId is required")
		}
		if strings.TrimSpace(req.Action) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "action is required")
		}
		if err := h.computer.PerformAccessibilityAction(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerFocusWindow:
		var req struct {
			WindowID string `json:"windowId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.WindowID) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "windowId is required")
		}
		if err := h.computer.FocusWindow(ctx, strings.TrimSpace(req.WindowID)); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerLaunchApplication:
		var req struct {
			BundleID string `json:"bundleId"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.BundleID) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "bundleId is required")
		}
		if err := h.computer.LaunchApplication(ctx, strings.TrimSpace(req.BundleID)); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerMovePointer:
		var req struct {
			Point computer.Point `json:"point"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.computer.MovePointer(ctx, req.Point); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerClick:
		var req computer.ClickRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.computer.Click(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerDrag:
		var req computer.DragRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.computer.Drag(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerScroll:
		var req computer.ScrollRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.computer.Scroll(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerTypeText:
		var req struct {
			Text string `json:"text"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.Text) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "text is required")
		}
		if err := h.computer.TypeText(ctx, req.Text); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerSendKey:
		var req computer.KeyRequest
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.Key) == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "key is required")
		}
		if err := h.computer.SendKey(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerReadClipboard:
		return h.computer.ReadClipboard(ctx)
	case MethodComputerWriteClipboard:
		var req computer.ClipboardContent
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.computer.WriteClipboard(ctx, req); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	case MethodComputerOpenPermissionSettings:
		var req struct {
			Permission string `json:"permission"`
		}
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		permission := strings.TrimSpace(req.Permission)
		if permission == "" {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, "permission is required")
		}
		if err := h.computer.OpenPermissionSettings(ctx, permission); err != nil {
			return nil, err
		}
		return map[string]bool{"ok": true}, nil
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown computer method: "+method)
	}
}

func withComputerApproval(ctx context.Context, params json.RawMessage) context.Context {
	if len(params) == 0 {
		return ctx
	}
	var req struct {
		Approved bool `json:"approved"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return ctx
	}
	return computer.WithApproval(ctx, req.Approved)
}
