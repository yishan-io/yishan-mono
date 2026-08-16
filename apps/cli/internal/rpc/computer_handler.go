package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/computer"
)

// ComputerHandler owns the computer.* RPC namespace decoding. Every method
// first applies the optional `approved` flag from the raw params to the
// context (computer-use confirmation gating).
type ComputerHandler struct {
	Services ComputerService
}

// Call implements Handler.
func (h *ComputerHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	ctx = withComputerApproval(ctx, params)

	switch method {
	case MethodComputerHealth:
		return h.Services.Health(ctx)
	case MethodComputerPermissions:
		return h.Services.Permissions(ctx)
	case MethodComputerGetConfig:
		return h.Services.GetConfig(ctx)
	case MethodComputerUpdateConfig:
		var req computer.FeatureConfig
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.UpdateConfig(ctx, req)
	case MethodComputerListDisplays:
		return h.Services.ListDisplays(ctx)
	case MethodComputerListApplications:
		return h.Services.ListApplications(ctx)
	case MethodComputerListWindows:
		var req ComputerListWindowsParams
		if len(params) == 0 {
			return h.Services.ListWindows(ctx, ComputerListWindowsParams{})
		}
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ListWindows(ctx, req)
	case MethodComputerCaptureDisplay:
		var req ComputerCaptureDisplayParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CaptureDisplay(ctx, req)
	case MethodComputerCaptureWindow:
		var req ComputerCaptureWindowParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CaptureWindow(ctx, req)
	case MethodComputerGetUITree:
		var req ComputerGetUITreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GetUITree(ctx, req)
	case MethodComputerPerformAction:
		var req computer.AccessibilityActionRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.PerformAction(ctx, req)
	case MethodComputerFocusWindow:
		var req ComputerFocusWindowParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.FocusWindow(ctx, req)
	case MethodComputerLaunchApplication:
		var req ComputerLaunchApplicationParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.LaunchApplication(ctx, req)
	case MethodComputerMovePointer:
		var req ComputerMovePointerParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.MovePointer(ctx, req)
	case MethodComputerClick:
		var req computer.ClickRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Click(ctx, req)
	case MethodComputerDrag:
		var req computer.DragRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Drag(ctx, req)
	case MethodComputerScroll:
		var req computer.ScrollRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Scroll(ctx, req)
	case MethodComputerTypeText:
		var req ComputerTypeTextParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.TypeText(ctx, req)
	case MethodComputerSendKey:
		var req computer.KeyRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.SendKey(ctx, req)
	case MethodComputerReadClipboard:
		return h.Services.ReadClipboard(ctx)
	case MethodComputerWriteClipboard:
		var req computer.ClipboardContent
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WriteClipboard(ctx, req)
	case MethodComputerOpenPermissionSettings:
		var req ComputerOpenPermissionSettingsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.OpenPermissionSettings(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown computer method: "+method)
	}
}

// withComputerApproval applies the optional `approved` flag from the raw
// params to the context (computer-use confirmation gating).
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
