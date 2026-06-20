package computer

import (
	"context"
	"errors"
	"testing"
)

func TestNewErrorWithDetails(t *testing.T) {
	t.Parallel()

	err := NewErrorWithDetails(ErrorCodePermissionMissing, "Accessibility permission is required", map[string]any{"permission": "accessibility"}, true)
	if err.Code != ErrorCodePermissionMissing {
		t.Fatalf("expected code %q, got %q", ErrorCodePermissionMissing, err.Code)
	}
	if err.Details["permission"] != "accessibility" {
		t.Fatalf("expected permission detail, got %#v", err.Details)
	}
	if !err.Retryable {
		t.Fatal("expected retryable error")
	}
}

func TestNoopRuntimeOpenPermissionSettingsReturnsUnavailable(t *testing.T) {
	t.Parallel()

	runtime := NoopRuntime{Platform: "linux", Reason: "computer runtime is unavailable on this platform"}
	err := runtime.OpenPermissionSettings(context.Background(), "accessibility")
	var computerErr *Error
	if !errors.As(err, &computerErr) {
		t.Fatalf("expected computer error, got %T", err)
	}
	if computerErr.Code != ErrorCodeUnavailable {
		t.Fatalf("expected unavailable code, got %q", computerErr.Code)
	}
}
