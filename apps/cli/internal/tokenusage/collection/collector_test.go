package collection

import (
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
)

// TestCloseStopsTimersAndRejectsNewWork covers the shutdown exit criterion:
// after Close, no new timers are scheduled, pending state is frozen, and the
// collector reports closed in DebugState.
func TestCloseStopsTimersAndRejectsNewWork(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.Trigger("gemini", "test")
	if _, ok := collector.timers["gemini"]; !ok {
		t.Fatal("expected a debounce timer before Close")
	}

	collector.Close()

	state := collector.DebugState()
	if !state.Closed {
		t.Fatal("expected DebugState to report closed")
	}
	if len(state.KnownTimers) != 0 {
		t.Fatalf("expected all timers stopped, got %#v", state.KnownTimers)
	}

	// Triggers after Close are no-ops and must not resurrect timers.
	collector.Trigger("gemini", "test")
	collector.SyncNow("test")
	if collector.closed != true {
		t.Fatal("expected collector to stay closed")
	}
	if _, ok := collector.timers["gemini"]; ok {
		t.Fatal("expected no timer after Close")
	}
}

// TestCloseIsIdempotent covers repeated Close calls: the second call must not
// panic or double-stop timers.
func TestCloseIsIdempotent(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.Close()
	collector.Close()
	if !collector.closed {
		t.Fatal("expected collector to be closed")
	}
}

// TestSyncNowSkipsInFlightAgents covers SyncNow's skip rule: an agent with a
// running scan is not started a second time.
func TestSyncNowSkipsInFlightAgents(t *testing.T) {
	repo := &countingHourlyUsageRepository{stubHourlyUsageRepository: stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{}}}
	collector := newTestCollector(repo)
	for _, kind := range tokenUsageScannableAgentKinds {
		collector.inFlight[kind] = true
	}

	collector.SyncNow("test")

	if repo.replaceCalls != 0 {
		t.Fatalf("expected no scan for in-flight agents, got %d replace calls", repo.replaceCalls)
	}
}
