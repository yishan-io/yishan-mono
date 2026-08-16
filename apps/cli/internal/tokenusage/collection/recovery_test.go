package collection

import (
	"testing"
	"time"
)

func TestRequestRecoveryScanMarksInFlightAgentForRerun(t *testing.T) {
	collector := &Collector{
		timers:               make(map[string]*time.Timer),
		inFlight:             map[string]bool{"recovery-probe": true},
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
	}

	shouldRun := collector.requestRecoveryScan("recovery-probe", 123)
	if shouldRun {
		t.Fatal("expected in-flight agent not to run immediately")
	}
	if collector.recoverySinceByAgent["recovery-probe"] != 123 {
		t.Fatal("expected recovery scan request to record the recovery window")
	}
	if !collector.needsRerun["recovery-probe"] {
		t.Fatal("expected in-flight agent to be marked for rerun")
	}
}

func TestRequestRecoveryScanRecordsWindowWithoutRerunWhenIdle(t *testing.T) {
	collector := &Collector{
		timers:               make(map[string]*time.Timer),
		inFlight:             map[string]bool{"recovery-probe": false},
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
	}

	shouldRun := collector.requestRecoveryScan("recovery-probe", 456)
	if !shouldRun {
		t.Fatal("expected idle agent to run immediately")
	}
	if collector.recoverySinceByAgent["recovery-probe"] != 456 {
		t.Fatal("expected recovery scan request to record the recovery window")
	}
	if collector.needsRerun["recovery-probe"] {
		t.Fatal("did not expect idle agent to be marked for rerun")
	}
}

func TestRequestRecoveryScanKeepsEarliestWindow(t *testing.T) {
	t.Parallel()

	collector := &Collector{
		recoverySinceByAgent: make(map[string]int64),
	}
	collector.requestRecoveryScan("opencode", 500)
	collector.requestRecoveryScan("opencode", 100)
	if collector.recoverySinceByAgent["opencode"] != 100 {
		t.Fatalf("expected earliest recovery window to win, got %d", collector.recoverySinceByAgent["opencode"])
	}
}

func TestRequestRecoveryScanIsNoOpAfterClose(t *testing.T) {
	collector := &Collector{
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		closed:               true,
	}

	shouldRun := collector.requestRecoveryScan("opencode", 123)
	if shouldRun {
		t.Fatal("expected closed collector to reject recovery scan")
	}
	if _, ok := collector.recoverySinceByAgent["opencode"]; ok {
		t.Fatal("expected closed collector not to record a recovery window")
	}
}
