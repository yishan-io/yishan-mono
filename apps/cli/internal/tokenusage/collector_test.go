package tokenusage

import (
	"context"
	"testing"
	"time"
)

type stubHourlyUsageRepository struct {
	state HourlyUsageSyncState
}

func (s *stubHourlyUsageRepository) ReplaceAgentHourlyRows(_ context.Context, _ string, _ []HourlyUsageRow) error {
	return nil
}

func (s *stubHourlyUsageRepository) ListDirtyHourlyRows(_ context.Context) ([]HourlyUsageRow, error) {
	return nil, nil
}

func (s *stubHourlyUsageRepository) MarkHourlyRowsSynced(_ context.Context, _ []HourlyUsageRow, _ int64) error {
	return nil
}

func (s *stubHourlyUsageRepository) GetHourlyUsageSyncState(_ context.Context) (HourlyUsageSyncState, error) {
	return s.state, nil
}

func TestRecentScanStartUnixMilliUsesBootstrapWhenNeverSynced(t *testing.T) {
	t.Parallel()

	collector := &Collector{repo: &stubHourlyUsageRepository{state: HourlyUsageSyncState{}}}
	if got := collector.recentScanStartUnixMilli(); got != 0 {
		t.Fatalf("expected bootstrap scan start 0, got %d", got)
	}
}

func TestRecentScanStartUnixMilliUsesLastSuccessfulSyncOverlap(t *testing.T) {
	t.Parallel()

	lastSuccessfulSyncAt := time.Date(2026, time.June, 3, 12, 0, 0, 0, time.UTC).UnixMilli()
	collector := &Collector{repo: &stubHourlyUsageRepository{state: HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}}}

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
		repo:                 &stubHourlyUsageRepository{state: HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
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
		repo:                 &stubHourlyUsageRepository{state: HourlyUsageSyncState{LastSuccessfulSyncAt: lastSuccessfulSyncAt}},
		recoverySinceByAgent: map[string]int64{"opencode": recoverySinceUnixMilli},
	}

	got := collector.resolveScanStartUnixMilli("opencode")
	if got != normalScanStartUnixMilli {
		t.Fatalf("expected normal scan start %d, got %d", normalScanStartUnixMilli, got)
	}
}
