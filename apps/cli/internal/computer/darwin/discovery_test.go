//go:build darwin

package darwin

import (
	"testing"

	"yishan/apps/cli/internal/computer"
)

func TestMatchesWindowFilter(t *testing.T) {
	t.Parallel()

	layer := 2
	window := computer.Window{
		PID:       42,
		BundleID:  "com.apple.Terminal",
		Title:     "Build Logs",
		Visible:   true,
		Frontmost: true,
		Layer:     2,
	}

	if !matchesWindowFilter(window, computer.WindowFilter{PID: 42, VisibleOnly: true, FrontmostOnly: true, IncludeLayer: &layer}) {
		t.Fatal("expected filter to match window")
	}
	if matchesWindowFilter(window, computer.WindowFilter{Title: "Safari"}) {
		t.Fatal("expected title mismatch to fail")
	}
}

func TestEnrichWindowsWithBundleIDs(t *testing.T) {
	t.Parallel()

	windows := []computer.Window{{ID: "window_1", PID: 42}}
	applications := []computer.Application{{ID: "app_42", PID: 42, BundleID: "com.apple.Terminal"}}

	enriched := enrichWindowsWithBundleIDs(windows, applications)
	if enriched[0].BundleID != "com.apple.Terminal" {
		t.Fatalf("expected bundle ID to be copied, got %#v", enriched[0])
	}
}
