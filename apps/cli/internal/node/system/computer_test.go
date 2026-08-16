package system

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"yishan/apps/cli/internal/computer"
	computermock "yishan/apps/cli/internal/computer/mock"
	"yishan/apps/cli/internal/rpc"
)

func TestComputerPermissions(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{}))

	result, err := s.callRPCForTest(context.Background(), rpc.MethodComputerPermissions, nil)
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

func TestComputerListDisplays(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{
		ListDisplaysFunc: func(_ context.Context) ([]computer.Display, error) {
			return []computer.Display{{ID: "display_1", NativeID: 1}}, nil
		},
	}))

	result, err := s.callRPCForTest(context.Background(), rpc.MethodComputerListDisplays, nil)
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

func TestComputerListWindowsUsesFilter(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{
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

	result, err := s.callRPCForTest(context.Background(), rpc.MethodComputerListWindows, params)
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

func TestComputerCaptureDisplay(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{
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

	result, err := s.callRPCForTest(context.Background(), rpc.MethodComputerCaptureDisplay, params)
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

func TestComputerCaptureWindowRequiresWindowID(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{}))

	params, err := json.Marshal(map[string]any{"windowId": ""})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, err = s.callRPCForTest(context.Background(), rpc.MethodComputerCaptureWindow, params)
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Message != "windowId is required" {
		t.Fatalf("unexpected error message: %q", rpcErr.Message)
	}
}

func TestComputerOpenPermissionSettingsRequiresPermission(t *testing.T) {
	t.Parallel()

	s := newTestHandler(t)
	s.SetComputerService(computer.NewService(computermock.Runtime{}))

	params, err := json.Marshal(map[string]any{"permission": ""})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, err = s.callRPCForTest(context.Background(), rpc.MethodComputerOpenPermissionSettings, params)
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected rpc error, got %T", err)
	}
	if rpcErr.Message != "permission is required" {
		t.Fatalf("unexpected error message: %q", rpcErr.Message)
	}
}

func TestMapRPCErrorIncludesComputerMetadata(t *testing.T) {
	t.Parallel()

	rpcErr := rpc.MapRPCError(computer.NewErrorWithDetails(
		computer.ErrorCodePermissionMissing,
		"Accessibility permission is required",
		map[string]any{"permission": "accessibility"},
		true,
	))

	data, ok := rpcErr.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected structured data, got %#v", rpcErr.Data)
	}
	if data["code"] != computer.ErrorCodePermissionMissing {
		t.Fatalf("expected computer code metadata, got %#v", data)
	}
	if data["retryable"] != true {
		t.Fatalf("expected retryable metadata, got %#v", data)
	}
}
