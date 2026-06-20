package mock

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/computer"
)

func TestRuntimeDefaults(t *testing.T) {
	t.Parallel()

	runtime := Runtime{}
	health, err := runtime.Health(context.Background())
	if err != nil {
		t.Fatalf("Health returned error: %v", err)
	}
	if !health.Available || health.Platform != "mock" {
		t.Fatalf("unexpected health result: %#v", health)
	}

	permissions, err := runtime.Permissions(context.Background())
	if err != nil {
		t.Fatalf("Permissions returned error: %v", err)
	}
	if permissions.Automation != computer.PermissionStateNotRequired {
		t.Fatalf("expected notRequired automation, got %q", permissions.Automation)
	}
}
