package collection

import (
	"context"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/workspace/instance"
)

type stubHourlyUsageRepository struct {
	state localdb.HourlyUsageSyncState
}

func (s *stubHourlyUsageRepository) ReplaceAgentHourlyRows(_ context.Context, _ string, _ []localdb.HourlyUsageRow) error {
	return nil
}

func (s *stubHourlyUsageRepository) ListDirtyHourlyRows(_ context.Context) ([]localdb.HourlyUsageRow, error) {
	return nil, nil
}

func (s *stubHourlyUsageRepository) MarkHourlyRowsSynced(_ context.Context, _ []localdb.HourlyUsageRow, _ int64) error {
	return nil
}

func (s *stubHourlyUsageRepository) GetHourlyUsageSyncState(_ context.Context) (localdb.HourlyUsageSyncState, error) {
	return s.state, nil
}

func TestRecentScanStartUnixMilliUsesBootstrapWhenNeverSynced(t *testing.T) {
	t.Parallel()

	collector := &Collector{repo: &stubHourlyUsageRepository{state: localdb.HourlyUsageSyncState{}}}
	if got := collector.recentScanStartUnixMilli(); got != 0 {
		t.Fatalf("expected bootstrap scan start 0, got %d", got)
	}
}

func TestRecentScanStartUnixMilliUsesLastSuccessfulSyncOverlap(t *testing.T) {
	t.Parallel()

	lastSuccessfulSyncAt := time.Date(2026, time.June, 3, 12, 0, 0, 0, time.UTC).UnixMilli()
	collector := &Collector{repo: &stubHourlyUsageRepository{state: localdb.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}}}

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
		repo:                 &stubHourlyUsageRepository{state: localdb.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
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
		repo:                 &stubHourlyUsageRepository{state: localdb.HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
		recoverySinceByAgent: map[string]int64{"opencode": recoverySinceUnixMilli},
	}

	got := collector.resolveScanStartUnixMilli("opencode")
	if got != normalScanStartUnixMilli {
		t.Fatalf("expected normal scan start %d, got %d", normalScanStartUnixMilli, got)
	}
}

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

// countingHourlyUsageRepository records replace calls so tests can assert
// replacement (not append) semantics.
type countingHourlyUsageRepository struct {
	stubHourlyUsageRepository
	replaceCalls int
	lastRows     []localdb.HourlyUsageRow
}

func (s *countingHourlyUsageRepository) ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []localdb.HourlyUsageRow) error {
	s.replaceCalls++
	s.lastRows = rows
	return nil
}

// TestRunScanReplacesRowsIdempotently covers the duplicate-input exit
// criterion at the collection level: re-scanning the same input replaces the
// agent's rows wholesale instead of accumulating (the DB replace is the dedup
// mechanism). gemini is used because its scanner is a deterministic empty
// stub.
func TestRunScanReplacesRowsIdempotently(t *testing.T) {
	repo := &countingHourlyUsageRepository{stubHourlyUsageRepository: stubHourlyUsageRepository{state: localdb.HourlyUsageSyncState{}}}
	collector := &Collector{
		registry:              instance.NewRegistry(files.NewFileService()),
		repo:                 repo,
		timers:               make(map[string]*time.Timer),
		inFlight:             make(map[string]bool),
		needsRerun:           make(map[string]bool),
		recoverySinceByAgent: make(map[string]int64),
		pending:              make(map[string][]localdb.HourlyUsageRow),
	}

	collector.runScan("gemini", "test")
	collector.runScan("gemini", "test")

	if repo.replaceCalls != 2 {
		t.Fatalf("expected 2 replace calls (one per scan), got %d", repo.replaceCalls)
	}
	if len(repo.lastRows) != 0 {
		t.Fatalf("expected empty replacement rows for the empty stub scan, got %d", len(repo.lastRows))
	}
}
