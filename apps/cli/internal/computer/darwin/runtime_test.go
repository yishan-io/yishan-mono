//go:build darwin

package darwin

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/computer"
)

func TestRuntimeHealthAvailableOnDarwin(t *testing.T) {
	t.Parallel()

	health, err := New().Health(context.Background())
	if err != nil {
		t.Fatalf("Health returned error: %v", err)
	}
	if !health.Available || health.Platform != "darwin" {
		t.Fatalf("unexpected health result: %#v", health)
	}
}

func TestPermissionStateMapping(t *testing.T) {
	t.Parallel()

	if permissionState(true) != computer.PermissionStateGranted {
		t.Fatal("expected granted state")
	}
	if permissionState(false) != computer.PermissionStateDenied {
		t.Fatal("expected denied state")
	}
}
