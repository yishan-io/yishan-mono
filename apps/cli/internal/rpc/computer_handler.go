package rpc

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/rpcerror"
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
		return h.Services.ComputerHealth(ctx)
	case MethodComputerPermissions:
		return h.Services.ComputerPermissions(ctx)
	case MethodComputerGetConfig:
		return h.Services.ComputerGetConfig(ctx)
	case MethodComputerUpdateConfig:
		var req computer.FeatureConfig
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerUpdateConfig(ctx, req)
	case MethodComputerListDisplays:
		return h.Services.ComputerListDisplays(ctx)
	case MethodComputerListApplications:
		return h.Services.ComputerListApplications(ctx)
	case MethodComputerListWindows:
		var req ComputerListWindowsParams
		if len(params) == 0 {
			return h.Services.ComputerListWindows(ctx, ComputerListWindowsParams{})
		}
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerListWindows(ctx, req)
	case MethodComputerCaptureDisplay:
		var req ComputerCaptureDisplayParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerCaptureDisplay(ctx, req)
	case MethodComputerCaptureWindow:
		var req ComputerCaptureWindowParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerCaptureWindow(ctx, req)
	case MethodComputerGetUITree:
		var req ComputerGetUITreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerGetUITree(ctx, req)
	case MethodComputerPerformAction:
		var req computer.AccessibilityActionRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerPerformAction(ctx, req)
	case MethodComputerFocusWindow:
		var req ComputerFocusWindowParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerFocusWindow(ctx, req)
	case MethodComputerLaunchApplication:
		var req ComputerLaunchApplicationParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerLaunchApplication(ctx, req)
	case MethodComputerMovePointer:
		var req ComputerMovePointerParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerMovePointer(ctx, req)
	case MethodComputerClick:
		var req computer.ClickRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerClick(ctx, req)
	case MethodComputerDrag:
		var req computer.DragRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerDrag(ctx, req)
	case MethodComputerScroll:
		var req computer.ScrollRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerScroll(ctx, req)
	case MethodComputerTypeText:
		var req ComputerTypeTextParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerTypeText(ctx, req)
	case MethodComputerSendKey:
		var req computer.KeyRequest
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerSendKey(ctx, req)
	case MethodComputerReadClipboard:
		return h.Services.ComputerReadClipboard(ctx)
	case MethodComputerWriteClipboard:
		var req computer.ClipboardContent
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerWriteClipboard(ctx, req)
	case MethodComputerOpenPermissionSettings:
		var req ComputerOpenPermissionSettingsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ComputerOpenPermissionSettings(ctx, req)
	default:
		return nil, rpcerror.NewRPCError(rpcerror.CodeMethodNotFound, "unknown computer method: "+method)
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
