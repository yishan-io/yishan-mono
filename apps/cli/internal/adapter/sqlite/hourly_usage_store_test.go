package sqlite

import (
	"context"
	"testing"
	"time"
)

func TestHourlyUsageStorePreservesMergeAndSyncSemantics(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()
	initialRow := newTestHourlyUsageRow(bucketStart, 100)
	initialRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{initialRow}); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	dirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	if len(dirtyRows) != 1 || !dirtyRows[0].Dirty {
		t.Fatalf("expected one dirty row, got %#v", dirtyRows)
	}

	syncedAt := time.Now().UTC().UnixMilli()
	if err := store.MarkHourlyRowsSynced(context.Background(), dirtyRows, syncedAt); err != nil {
		t.Fatalf("mark rows synced: %v", err)
	}

	partialRow := newTestHourlyUsageRow(bucketStart, 50)
	partialRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{partialRow}); err != nil {
		t.Fatalf("replace partial row: %v", err)
	}

	if err := store.MarkHourlyRowsSynced(context.Background(), []HourlyUsageRow{partialRow}, syncedAt+1); err != nil {
		t.Fatalf("mark stale row synced: %v", err)
	}
	state, err := store.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get sync state: %v", err)
	}
	if state.DirtyRows != 0 || state.TotalRows != 1 {
		t.Fatalf("expected one clean row after partial rescan, got %#v", state)
	}
}

func TestHourlyUsageStoreAggregatesConcurrentSourcesAndKeepsRescansIdempotent(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()
	firstSessionRow := newTestHourlyUsageRow(bucketStart, 100)
	firstSessionRow.OutputTokens = 20
	firstSessionRow.TotalTokens = 120
	firstSessionRow.TotalCostMicrosUSD = 250_000
	firstSessionRow.CostSource = CostSourceDirect
	firstSessionRow.ScannerSourceID = "/tmp/session-1.jsonl"
	secondSessionRow := newTestHourlyUsageRow(bucketStart, 80)
	secondSessionRow.OutputTokens = 15
	secondSessionRow.TotalTokens = 95
	secondSessionRow.TotalCostMicrosUSD = 125_000
	secondSessionRow.CostSource = CostSourceDirect
	secondSessionRow.ScannerSourceID = "/tmp/session-2.jsonl"

	rows := []HourlyUsageRow{firstSessionRow, secondSessionRow}
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", rows); err != nil {
		t.Fatalf("replace concurrent session rows: %v", err)
	}

	dirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	if len(dirtyRows) != 1 {
		t.Fatalf("expected one aggregated dirty row, got %#v", dirtyRows)
	}
	aggregatedRow := dirtyRows[0]
	if aggregatedRow.InputTokens != 180 || aggregatedRow.OutputTokens != 35 || aggregatedRow.TotalTokens != 215 {
		t.Fatalf("expected summed tokens, got %#v", aggregatedRow)
	}
	if aggregatedRow.TotalCostMicrosUSD != 375_000 || aggregatedRow.CostSource != CostSourceDirect {
		t.Fatalf("expected summed direct cost, got %#v", aggregatedRow)
	}
	if aggregatedRow.EventCount != 2 || aggregatedRow.SessionCount != 2 {
		t.Fatalf("expected summed counts, got %#v", aggregatedRow)
	}
	if aggregatedRow.ScannerSourceKind != scannerSourceKindAggregate || aggregatedRow.ScannerSourceID != "" {
		t.Fatalf("expected aggregate source metadata, got %#v", aggregatedRow)
	}

	syncedAt := time.Now().UTC().UnixMilli()
	if err := store.MarkHourlyRowsSynced(context.Background(), dirtyRows, syncedAt); err != nil {
		t.Fatalf("mark aggregated row synced: %v", err)
	}
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", rows); err != nil {
		t.Fatalf("rescan concurrent session rows: %v", err)
	}
	dirtyRows, err = store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after rescan: %v", err)
	}
	if len(dirtyRows) != 0 {
		t.Fatalf("expected idempotent rescan to remain clean, got %#v", dirtyRows)
	}
}

func TestHourlyUsageStoreRetainsExpiredDirtyRows(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	oldBucket := time.Now().UTC().Add(-HourlyUsageRetentionWindow - time.Hour).UnixMilli()
	dirtyRow := newTestHourlyUsageRow(oldBucket, 100)
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{dirtyRow}); err != nil {
		t.Fatalf("seed dirty row: %v", err)
	}
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", nil); err != nil {
		t.Fatalf("trigger prune: %v", err)
	}

	dirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	if len(dirtyRows) != 1 || dirtyRows[0].BucketStartHourUTC != oldBucket {
		t.Fatalf("expected expired dirty row to remain, got %#v", dirtyRows)
	}
}

func TestHourlyUsageStorePreservesExistingCostOnSameTokenRescan(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()
	initialRow := newTestHourlyUsageRow(bucketStart, 100)
	initialRow.TotalCostMicrosUSD = 123_000
	initialRow.CostSource = CostSourceEstimated
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{initialRow}); err != nil {
		t.Fatalf("seed row: %v", err)
	}
	if err := store.MarkHourlyRowsSynced(context.Background(), []HourlyUsageRow{initialRow}, time.Now().UTC().UnixMilli()); err != nil {
		t.Fatalf("mark synced: %v", err)
	}

	rescanRow := newTestHourlyUsageRow(bucketStart, 100)
	rescanRow.TotalCostMicrosUSD = 0
	rescanRow.CostSource = CostSourceUnknown
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{rescanRow}); err != nil {
		t.Fatalf("rescan row: %v", err)
	}

	rows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected preserved clean row, got %#v", rows)
	}

	var cost int64
	if err := database.QueryRow(`SELECT total_cost_micros_usd FROM token_usage_hourly WHERE bucket_start_hour_utc = ?`, bucketStart).Scan(&cost); err != nil {
		t.Fatalf("query row: %v", err)
	}
	if cost != 123_000 {
		t.Fatalf("expected preserved cost 123000, got %d", cost)
	}
}

func TestHourlyUsageStoreBackfillsHistoricalCostBeforeCutoff(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	cutoff := time.Now().UTC().UnixMilli()
	historicalRow := newTestHourlyUsageRow(cutoff-2_000, 100)
	historicalRow.TotalCostMicrosUSD = 0
	historicalRow.UpdatedAt = cutoff - 2_000
	historicalRow.Dirty = false
	directZeroRow := newTestHourlyUsageRow(cutoff-1_000, 110)
	directZeroRow.BucketStartHourUTC = cutoff - 1_000
	directZeroRow.TotalCostMicrosUSD = 0
	directZeroRow.CostSource = CostSourceDirect
	directZeroRow.UpdatedAt = cutoff - 1_000
	directZeroRow.Dirty = false
	currentRow := newTestHourlyUsageRow(cutoff+2_000, 120)
	currentRow.BucketStartHourUTC = cutoff + 2_000
	currentRow.TotalCostMicrosUSD = 0
	currentRow.UpdatedAt = cutoff + 2_000
	currentRow.Dirty = false
	if err := store.UpsertHourlyUsageRows(context.Background(), []HourlyUsageRow{historicalRow, directZeroRow, currentRow}); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	startedAt, err := store.EnsureCostBackfillStartedAt(context.Background(), cutoff)
	if err != nil {
		t.Fatalf("ensure cost backfill started-at: %v", err)
	}
	if startedAt != cutoff {
		t.Fatalf("expected started-at cutoff %d, got %d", cutoff, startedAt)
	}

	updatedCount, err := store.BackfillEstimatedCost(context.Background(), startedAt, func(row HourlyUsageRow) int64 {
		if row.BucketStartHourUTC == historicalRow.BucketStartHourUTC {
			return 123_000
		}
		return 456_000
	}, CostBackfillOptions{})
	if err != nil {
		t.Fatalf("backfill estimated cost: %v", err)
	}
	if updatedCount != 1 {
		t.Fatalf("expected 1 updated row, got %d", updatedCount)
	}

	var historicalCost int64
	var historicalDirty int
	if err := database.QueryRow(`SELECT total_cost_micros_usd, is_dirty FROM token_usage_hourly WHERE bucket_start_hour_utc = ?`, historicalRow.BucketStartHourUTC).Scan(&historicalCost, &historicalDirty); err != nil {
		t.Fatalf("query historical row: %v", err)
	}
	if historicalCost != 123_000 {
		t.Fatalf("expected historical cost 123000, got %d", historicalCost)
	}
	if historicalDirty != 1 {
		t.Fatalf("expected historical row dirty after backfill, got %d", historicalDirty)
	}

	var directZeroCost int64
	var directZeroDirty int
	var directZeroSource string
	if err := database.QueryRow(`SELECT total_cost_micros_usd, is_dirty, cost_source FROM token_usage_hourly WHERE bucket_start_hour_utc = ?`, directZeroRow.BucketStartHourUTC).Scan(&directZeroCost, &directZeroDirty, &directZeroSource); err != nil {
		t.Fatalf("query direct-zero row: %v", err)
	}
	if directZeroCost != 0 {
		t.Fatalf("expected direct-zero row cost to remain 0, got %d", directZeroCost)
	}
	if directZeroDirty != 0 {
		t.Fatalf("expected direct-zero row to remain clean, got %d", directZeroDirty)
	}
	if directZeroSource != string(CostSourceDirect) {
		t.Fatalf("expected direct-zero row cost source %q, got %q", CostSourceDirect, directZeroSource)
	}

	var currentCost int64
	var currentDirty int
	if err := database.QueryRow(`SELECT total_cost_micros_usd, is_dirty FROM token_usage_hourly WHERE bucket_start_hour_utc = ?`, currentRow.BucketStartHourUTC).Scan(&currentCost, &currentDirty); err != nil {
		t.Fatalf("query current row: %v", err)
	}
	if currentCost != 0 {
		t.Fatalf("expected current row cost to remain 0, got %d", currentCost)
	}
	if currentDirty != 0 {
		t.Fatalf("expected current row to remain clean, got %d", currentDirty)
	}
}

func newTestHourlyUsageRow(bucketStartHourUTC int64, totalTokens int64) HourlyUsageRow {
	return HourlyUsageRow{
		ProjectID:             "project-1",
		WorkspaceID:           "workspace-1",
		WorkspacePath:         "/tmp/workspace",
		AgentKind:             "claude",
		Model:                 "claude-opus-4-6",
		ModelNormalized:       "claude-opus-4-6",
		BucketStartHourUTC:    bucketStartHourUTC,
		InputTokens:           totalTokens,
		OutputTokens:          0,
		CachedInputTokens:     0,
		CachedWriteTokens:     0,
		ReasoningTokens:       0,
		TotalTokens:           totalTokens,
		EventCount:            1,
		SessionCount:          1,
		TurnCount:             0,
		ToolCallCount:         0,
		AttributionConfidence: "exact",
		ScannerSourceKind:     "jsonl",
		ScannerSourceID:       "/tmp/source.jsonl",
		IngestedAt:            bucketStartHourUTC,
		RunID:                 "daemon-claude",
		UpdatedAt:             bucketStartHourUTC,
	}
}

func TestCostBackfillCompleted_RequiresCurrentVersion(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	store := NewHourlyUsageStore(database)

	completed, err := store.CostBackfillCompleted(context.Background())
	if err != nil {
		t.Fatalf("CostBackfillCompleted: %v", err)
	}
	if completed {
		t.Fatal("expected backfill to be incomplete before any marker is set")
	}

	// A stale version must not satisfy the completion check so the backfill
	// re-runs when the version constant is bumped.
	if err := setMetadataKey(context.Background(), database, "token_usage_cost_backfill_completed", "v1"); err != nil {
		t.Fatalf("set stale backfill marker: %v", err)
	}
	completed, err = store.CostBackfillCompleted(context.Background())
	if err != nil {
		t.Fatalf("CostBackfillCompleted: %v", err)
	}
	if completed {
		t.Fatal("expected stale backfill version not to satisfy completion")
	}

	if err := store.MarkCostBackfillCompleted(context.Background()); err != nil {
		t.Fatalf("MarkCostBackfillCompleted: %v", err)
	}
	completed, err = store.CostBackfillCompleted(context.Background())
	if err != nil {
		t.Fatalf("CostBackfillCompleted: %v", err)
	}
	if !completed {
		t.Fatal("expected current backfill version to satisfy completion")
	}
}
