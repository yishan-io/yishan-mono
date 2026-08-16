package collection

import (
	"testing"
)

// TestTriggerSchedulesDebounceTimer covers the trigger path: a valid agent
// kind gets a debounce timer; an unknown kind is ignored.
func TestTriggerSchedulesDebounceTimer(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})

	collector.Trigger("gemini", "test")
	if _, ok := collector.timers["gemini"]; !ok {
		t.Fatal("expected a debounce timer for gemini")
	}

	collector.Trigger("not-an-agent", "test")
	if len(collector.timers) != 1 {
		t.Fatalf("expected unknown agent kind to be ignored, got timers %#v", collector.timers)
	}
}

// TestTriggerCoalescesIntoRerunWhenInFlight covers concurrent triggers: a
// second trigger while the first scan is running must not schedule a second
// timer; it is coalesced into a single rerun request.
func TestTriggerCoalescesIntoRerunWhenInFlight(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.inFlight["gemini"] = true

	collector.Trigger("gemini", "test")
	if _, ok := collector.timers["gemini"]; ok {
		t.Fatal("expected no new timer for in-flight agent")
	}
	if !collector.needsRerun["gemini"] {
		t.Fatal("expected in-flight agent to be marked for rerun")
	}
}

// TestTriggerIsNoOpAfterClose covers the shutdown exit criterion: triggers
// after Close must not schedule timers.
func TestTriggerIsNoOpAfterClose(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.Close()

	collector.Trigger("gemini", "test")
	if _, ok := collector.timers["gemini"]; ok {
		t.Fatal("expected no timer after Close")
	}
}

// TestStartupScanIsOwnedByCollector covers the lifecycle contract: the
// startup timer is recorded in the collector and stopped by Close.
func TestStartupScanIsOwnedByCollector(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.StartStartupScan()

	state := collector.DebugState()
	found := false
	for key := range state.KnownTimers {
		if key == "startup" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected startup timer registered, got %#v", state.KnownTimers)
	}

	collector.Close()
	state = collector.DebugState()
	if state.Closed != true {
		t.Fatal("expected collector closed after Close")
	}
	for key := range state.KnownTimers {
		if key == "startup" {
			t.Fatal("expected startup timer stopped by Close")
		}
	}
}

// TestStartupScanAfterCloseStopsTimer covers the race: StartStartupScan
// racing a Close must not leave a live timer behind.
func TestStartupScanAfterCloseStopsTimer(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.Close()
	collector.StartStartupScan()

	state := collector.DebugState()
	for key := range state.KnownTimers {
		t.Fatalf("expected no timers after Close, got %q", key)
	}
}
