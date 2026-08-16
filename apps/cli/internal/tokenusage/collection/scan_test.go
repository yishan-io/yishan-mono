package collection

import (
	"context"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/tokenusage/scanner"
)

var errTestScanFailure = errors.New("test scan failure")

func TestRecentScanStartUnixMilliUsesBootstrapWhenNeverSynced(t *testing.T) {
	t.Parallel()

	collector := &Collector{repo: &stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{}}}
	if got := collector.recentScanStartUnixMilli(); got != 0 {
		t.Fatalf("expected bootstrap scan start 0, got %d", got)
	}
}

func TestRecentScanStartUnixMilliUsesLastSuccessfulSyncOverlap(t *testing.T) {
	t.Parallel()

	lastSuccessfulSyncAt := time.Date(2026, time.June, 3, 12, 0, 0, 0, time.UTC).UnixMilli()
	collector := &Collector{repo: &stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}}}

	got := collector.recentScanStartUnixMilli()
	want := time.UnixMilli(lastSuccessfulSyncAt).UTC().Add(-tokenUsageScanOverlap).UnixMilli()
	if got != want {
		t.Fatalf("expected scan start %d, got %d", want, got)
	}
}

func TestResolveScanStartUnixMilliUsesRecoveryWindowWhenEarlier(t *testing.T) {
	t.Parallel()

	lastSuccessfulSyncAt := time.Date(2026, time.June, 3, 12, 0, 0, 0, time.UTC).UnixMilli()
	recoverySinceUnixMilli := time.Date(2026, time.May, 30, 12, 0, 0, 0, time.UTC).UnixMilli()
	collector := &Collector{
		repo:                 &stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
		recoverySinceByAgent: map[string]int64{"opencode": recoverySinceUnixMilli},
	}

	got := collector.resolveScanStartUnixMilli("opencode")
	if got != recoverySinceUnixMilli {
		t.Fatalf("expected recovery scan start %d, got %d", recoverySinceUnixMilli, got)
	}
}

func TestResolveScanStartUnixMilliKeepsNormalWindowWhenRecoveryIsLater(t *testing.T) {
	t.Parallel()

	lastSuccessfulSyncAt := time.Date(2026, time.June, 3, 12, 0, 0, 0, time.UTC).UnixMilli()
	normalScanStartUnixMilli := time.UnixMilli(lastSuccessfulSyncAt).UTC().Add(-tokenUsageScanOverlap).UnixMilli()
	recoverySinceUnixMilli := normalScanStartUnixMilli + int64(time.Hour)
	collector := &Collector{
		repo:                 &stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
		recoverySinceByAgent: map[string]int64{"opencode": recoverySinceUnixMilli},
	}

	got := collector.resolveScanStartUnixMilli("opencode")
	if got != normalScanStartUnixMilli {
		t.Fatalf("expected normal scan start %d, got %d", normalScanStartUnixMilli, got)
	}
}

// TestRunScanReplacesRowsIdempotently covers the duplicate-input exit
// criterion at the collection level: re-scanning the same input replaces the
// agent's rows wholesale instead of accumulating (the DB replace is the dedup
// mechanism). gemini is used because its scanner is a deterministic empty
// stub.
func TestRunScanReplacesRowsIdempotently(t *testing.T) {
	repo := &countingHourlyUsageRepository{stubHourlyUsageRepository: stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{}}}
	collector := newTestCollector(repo)

	collector.runScan("gemini", "test")
	collector.runScan("gemini", "test")

	if repo.replaceCalls != 2 {
		t.Fatalf("expected 2 replace calls (one per scan), got %d", repo.replaceCalls)
	}
	if len(repo.lastRows) != 0 {
		t.Fatalf("expected empty replacement rows for the empty stub scan, got %d", len(repo.lastRows))
	}
}

// TestRunScanRetriesAfterTransientFailure covers the retry exit criterion: a
// failed replace leaves the agent free for the next trigger (no in-flight or
// rerun residue) so the next runScan retries the same window.
func TestRunScanRetriesAfterTransientFailure(t *testing.T) {
	repo := &failingReplaceRepository{failuresRemaining: 1}
	collector := newTestCollector(repo)

	collector.runScan("gemini", "test")
	collector.runScan("gemini", "test")

	if repo.replaceCalls != 2 {
		t.Fatalf("expected 2 replace calls (first fails, second retries), got %d", repo.replaceCalls)
	}
	if collector.inFlight["gemini"] {
		t.Fatal("expected scan to be out of flight after the retry")
	}
	if collector.needsRerun["gemini"] {
		t.Fatal("expected no rerun residue after the retry")
	}
}

// TestRunScanCoalescesTriggerIntoRerun covers the concurrent-trigger exit
// criterion: a trigger arriving while the scan is in flight marks needsRerun
// instead of starting a second scan, and finishScan hands the rerun back to
// the scheduler.
func TestRunScanCoalescesTriggerIntoRerun(t *testing.T) {
	collector := newTestCollector(&stubHourlyUsageRepository{})
	collector.beginScan("gemini")
	collector.Trigger("gemini", "test")
	if !collector.needsRerun["gemini"] {
		t.Fatal("expected in-flight trigger to mark needsRerun")
	}
	shouldRerun, closed := collector.finishScan("gemini", true)
	if !shouldRerun {
		t.Fatal("expected finishScan to report the pending rerun")
	}
	if closed {
		t.Fatal("did not expect collector to be closed")
	}
}

// TestRunScanUsesRegisteredCustomScanner covers the registration contract:
// a scanner registered for an agent kind is dispatched by the collector
// instead of the built-in provider set.
func TestRunScanUsesRegisteredCustomScanner(t *testing.T) {
	repo := &countingHourlyUsageRepository{stubHourlyUsageRepository: stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{}}}
	registry := scanner.NewRegistry()
	registry.Register("custom-kind", scanner.ScannerFunc(func(_ context.Context, _ scanner.ScanInput) ([]record.UsageRecord, error) {
		return []record.UsageRecord{{AgentKind: "custom-kind"}}, nil
	}))
	collector := newTestCollector(repo)
	collector.scanners = registry

	collector.runScan("custom-kind", "test")

	if repo.replaceCalls != 1 {
		t.Fatalf("expected 1 replace call for registered scanner, got %d", repo.replaceCalls)
	}
	if len(repo.lastRows) != 1 || repo.lastRows[0].AgentKind != "custom-kind" {
		t.Fatalf("expected custom scanner rows to reach the repository, got %#v", repo.lastRows)
	}
}

// TestRunScanUnregisteredKindReturnsEmpty covers the dispatch fallback: an
// agent kind with no registered scanner produces an empty result instead of
// failing or dispatching into a built-in provider.
func TestRunScanUnregisteredKindReturnsEmpty(t *testing.T) {
	repo := &countingHourlyUsageRepository{stubHourlyUsageRepository: stubHourlyUsageRepository{state: sqlite.HourlyUsageSyncState{}}}
	collector := newTestCollector(repo)
	collector.scanners = scanner.NewRegistry()

	collector.runScan("not-registered", "test")

	if repo.replaceCalls != 1 {
		t.Fatalf("expected 1 replace call with empty rows, got %d", repo.replaceCalls)
	}
	if len(repo.lastRows) != 0 {
		t.Fatalf("expected empty rows for unregistered kind, got %#v", repo.lastRows)
	}
}
