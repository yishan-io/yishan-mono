package db

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
