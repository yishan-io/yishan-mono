package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"yishan/apps/cli/internal/computer"
	computermock "yishan/apps/cli/internal/computer/mock"
	"yishan/apps/cli/internal/workspace"
)

func TestDispatchComputerPermissions(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{}))

	result, err := h.dispatchComputer(context.Background(), MethodComputerPermissions, nil)
	if err != nil {
		t.Fatalf("dispatchComputer returned error: %v", err)
	}

	permissions, ok := result.(computer.PermissionStatus)
	if !ok {
		t.Fatalf("expected PermissionStatus, got %T", result)
	}
	if permissions.Accessibility != computer.PermissionStateGranted {
		t.Fatalf("expected granted accessibility, got %q", permissions.Accessibility)
	}
}

func TestDispatchComputerListDisplays(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{
		ListDisplaysFunc: func(_ context.Context) ([]computer.Display, error) {
			return []computer.Display{{ID: "display_1", NativeID: 1}}, nil
		},
	}))

	result, err := h.dispatchComputer(context.Background(), MethodComputerListDisplays, nil)
	if err != nil {
		t.Fatalf("dispatchComputer returned error: %v", err)
	}

	displays, ok := result.([]computer.Display)
	if !ok {
		t.Fatalf("expected []computer.Display, got %T", result)
	}
	if len(displays) != 1 || displays[0].ID != "display_1" {
		t.Fatalf("unexpected displays result: %#v", displays)
	}
}

func TestDispatchComputerListWindowsUsesFilter(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{
		ListWindowsFunc: func(_ context.Context, filter computer.WindowFilter) ([]computer.Window, error) {
			if !filter.VisibleOnly || filter.PID != 42 {
				t.Fatalf("unexpected filter: %#v", filter)
			}
			return []computer.Window{{ID: "window_7", PID: 42, Visible: true}}, nil
		},
	}))

	params, err := json.Marshal(map[string]any{
		"filter": map[string]any{"pid": 42, "visibleOnly": true},
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := h.dispatchComputer(context.Background(), MethodComputerListWindows, params)
	if err != nil {
		t.Fatalf("dispatchComputer returned error: %v", err)
	}

	windows, ok := result.([]computer.Window)
	if !ok {
		t.Fatalf("expected []computer.Window, got %T", result)
	}
	if len(windows) != 1 || windows[0].PID != 42 {
		t.Fatalf("unexpected windows result: %#v", windows)
	}
}

func TestDispatchComputerCaptureDisplay(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{
		CaptureDisplayFunc: func(_ context.Context, displayID string, options computer.CaptureOptions) (computer.Image, error) {
			if displayID != "display_1" {
				t.Fatalf("unexpected displayID: %q", displayID)
			}
			if options.Format != "jpeg" {
				t.Fatalf("unexpected options: %#v", options)
			}
			return computer.Image{MimeType: "image/jpeg", Width: 10, Height: 5}, nil
		},
	}))

	params, err := json.Marshal(map[string]any{
		"displayId": "display_1",
		"options":   map[string]any{"format": "jpeg"},
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := h.dispatchComputer(context.Background(), MethodComputerCaptureDisplay, params)
	if err != nil {
		t.Fatalf("dispatchComputer returned error: %v", err)
	}

	image, ok := result.(computer.Image)
	if !ok {
		t.Fatalf("expected computer.Image, got %T", result)
	}
	if image.MimeType != "image/jpeg" {
		t.Fatalf("unexpected image result: %#v", image)
	}
}

func TestDispatchComputerCaptureWindowRequiresWindowID(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{}))

	params, err := json.Marshal(map[string]any{"windowId": ""})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, err = h.dispatchComputer(context.Background(), MethodComputerCaptureWindow, params)
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Message != "windowId is required" {
		t.Fatalf("unexpected error message: %q", rpcErr.Message)
	}
}

func TestDispatchComputerOpenPermissionSettingsRequiresPermission(t *testing.T) {
	t.Parallel()

	h := newTestHandler(t)
	h.SetComputerService(newComputerService(computermock.Runtime{}))

	params, err := json.Marshal(map[string]any{"permission": ""})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, err = h.dispatchComputer(context.Background(), MethodComputerOpenPermissionSettings, params)
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Message != "permission is required" {
		t.Fatalf("unexpected error message: %q", rpcErr.Message)
	}
}

func TestMapRPCErrorIncludesComputerMetadata(t *testing.T) {
	t.Parallel()

	rpcErr := mapRPCError(computer.NewErrorWithDetails(
		computer.ErrorCodePermissionMissing,
		"Accessibility permission is required",
		map[string]any{"permission": "accessibility"},
		true,
	))

	if rpcErr.Data["code"] != computer.ErrorCodePermissionMissing {
		t.Fatalf("expected computer code metadata, got %#v", rpcErr.Data)
	}
	if rpcErr.Data["retryable"] != true {
		t.Fatalf("expected retryable metadata, got %#v", rpcErr.Data)
	}
}
