//go:build darwin

package darwin

import (
	"testing"

	"yishan/apps/cli/internal/computer"
)

func TestNormalizeCaptureOptions(t *testing.T) {
	t.Parallel()

	options := normalizeCaptureOptions(computer.CaptureOptions{Format: " JPG ", MaxWidth: -1, MaxHeight: -5})
	if options.Format != "jpg" && options.Format != "jpeg" {
		t.Fatalf("expected jpeg-like format, got %#v", options)
	}
	if options.MaxWidth != 0 || options.MaxHeight != 0 {
		t.Fatalf("expected negative limits to clamp to zero, got %#v", options)
	}
}

func TestParseOpaqueID(t *testing.T) {
	t.Parallel()

	nativeID, err := parseOpaqueID("window_42", "window_")
	if err != nil {
		t.Fatalf("parseOpaqueID returned error: %v", err)
	}
	if nativeID != 42 {
		t.Fatalf("expected native id 42, got %d", nativeID)
	}

	if _, err := parseOpaqueID("bad-id", "window_"); err == nil {
		t.Fatal("expected parseOpaqueID to reject invalid ids")
	}
}
