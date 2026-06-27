package tokenusage

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestFileHourlyUsageRepositoryTracksDirtyRowsIncrementally(t *testing.T) {
	t.Parallel()

	repo, err := NewFileHourlyUsageRepository(filepath.Join(t.TempDir(), "credential.yaml"))
	if err != nil {
		t.Fatalf("new repository: %v", err)
	}

	now := time.Now().UTC()
	oldBucket := now.Add(-HourlyUsageLocalRetentionWindow - time.Hour).UnixMilli()
	recentBucket := now.Add(-time.Hour).UnixMilli()
	initialRows := []HourlyUsageRow{
		newHourlyUsageRow(oldBucket, 10),
		newHourlyUsageRow(recentBucket, 20),
	}

	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", initialRows); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	dirtyRows, err := repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after seed: %v", err)
	}
	if len(dirtyRows) != 2 {
		t.Fatalf("expected 2 dirty rows after seed, got %d", len(dirtyRows))
	}

	syncedAt := now.UnixMilli()
	if err := repo.MarkHourlyRowsSynced(context.Background(), dirtyRows, syncedAt); err != nil {
		t.Fatalf("mark synced: %v", err)
	}

	state, err := repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get sync state after sync: %v", err)
	}
	if state.DirtyRows != 0 {
		t.Fatalf("expected 0 dirty rows after sync, got %d", state.DirtyRows)
	}
	if state.TotalRows != 1 {
		t.Fatalf("expected old clean row to be pruned, got total rows %d", state.TotalRows)
	}
	if state.LastSuccessfulSyncAt != syncedAt {
		t.Fatalf("expected last successful sync %d, got %d", syncedAt, state.LastSuccessfulSyncAt)
	}

	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{newHourlyUsageRow(recentBucket, 20)}); err != nil {
		t.Fatalf("replace unchanged row: %v", err)
	}

	state, err = repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get sync state after unchanged replace: %v", err)
	}
	if state.DirtyRows != 0 {
		t.Fatalf("expected unchanged row to remain clean, got %d dirty rows", state.DirtyRows)
	}

	changedRow := newHourlyUsageRow(recentBucket, 30)
	changedRow.UpdatedAt = now.Add(time.Minute).UnixMilli()
	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{changedRow}); err != nil {
		t.Fatalf("replace changed row: %v", err)
	}

	dirtyRows, err = repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after change: %v", err)
	}
	if len(dirtyRows) != 1 {
		t.Fatalf("expected 1 dirty row after change, got %d", len(dirtyRows))
	}
	if dirtyRows[0].TotalTokens != 30 {
		t.Fatalf("expected changed row total tokens 30, got %d", dirtyRows[0].TotalTokens)
	}
	if dirtyRows[0].LastSyncedAt != syncedAt {
		t.Fatalf("expected changed row to preserve last synced at %d, got %d", syncedAt, dirtyRows[0].LastSyncedAt)
	}

	if err := repo.MarkHourlyRowsSynced(context.Background(), []HourlyUsageRow{newHourlyUsageRow(recentBucket, 20)}, now.Add(2*time.Minute).UnixMilli()); err != nil {
		t.Fatalf("mark stale row synced: %v", err)
	}

	dirtyRows, err = repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after stale sync attempt: %v", err)
	}
	if len(dirtyRows) != 1 {
		t.Fatalf("expected changed row to stay dirty after stale sync attempt, got %d dirty rows", len(dirtyRows))
	}
}

func TestFileHourlyUsageRepositoryKeepsHigherTokenRowOnPartialRescan(t *testing.T) {
	t.Parallel()

	repo := newTestFileHourlyUsageRepository(t)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()

	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{newHourlyUsageRow(bucketStart, 100)}); err != nil {
		t.Fatalf("seed rows: %v", err)
	}
	dirtyRows, err := repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after seed: %v", err)
	}
	if err := repo.MarkHourlyRowsSynced(context.Background(), dirtyRows, time.Now().UTC().UnixMilli()); err != nil {
		t.Fatalf("mark synced: %v", err)
	}

	partialRow := newHourlyUsageRow(bucketStart, 50)
	partialRow.UpdatedAt = partialRow.UpdatedAt + time.Minute.Milliseconds()
	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{partialRow}); err != nil {
		t.Fatalf("replace with lower-token partial row: %v", err)
	}

	storedRows := loadTestRepositoryRows(t, repo)
	if len(storedRows) != 1 {
		t.Fatalf("expected 1 stored row, got %d", len(storedRows))
	}
	if storedRows[0].TotalTokens != 100 {
		t.Fatalf("expected stored row total tokens 100, got %d", storedRows[0].TotalTokens)
	}

	dirtyRows, err = repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after partial re-scan: %v", err)
	}
	if len(dirtyRows) != 0 {
		t.Fatalf("expected lower-token partial re-scan to keep row clean, got %d dirty rows", len(dirtyRows))
	}
}

func TestFileHourlyUsageRepositoryPreservesOmittedBucketsOnPartialRescan(t *testing.T) {
	t.Parallel()

	repo := newTestFileHourlyUsageRepository(t)
	now := time.Now().UTC()
	olderBucket := now.Add(-2 * time.Hour).UnixMilli()
	recentBucket := now.Add(-time.Hour).UnixMilli()
	seedRows := []HourlyUsageRow{
		newHourlyUsageRow(olderBucket, 100),
		newHourlyUsageRow(recentBucket, 200),
	}

	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", seedRows); err != nil {
		t.Fatalf("seed rows: %v", err)
	}
	dirtyRows, err := repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after seed: %v", err)
	}
	if err := repo.MarkHourlyRowsSynced(context.Background(), dirtyRows, now.UnixMilli()); err != nil {
		t.Fatalf("mark synced: %v", err)
	}

	changedRecentRow := newHourlyUsageRow(recentBucket, 300)
	changedRecentRow.UpdatedAt = changedRecentRow.UpdatedAt + time.Minute.Milliseconds()
	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{changedRecentRow}); err != nil {
		t.Fatalf("replace recent bucket with changed row: %v", err)
	}

	if err := repo.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{newHourlyUsageRow(olderBucket, 100)}); err != nil {
		t.Fatalf("partial re-scan with omitted dirty bucket: %v", err)
	}

	state, err := repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get sync state: %v", err)
	}
	if state.TotalRows != 2 {
		t.Fatalf("expected 2 rows after omitted-bucket partial re-scan, got %d", state.TotalRows)
	}
	if state.DirtyRows != 1 {
		t.Fatalf("expected 1 dirty row after omitted-bucket partial re-scan, got %d", state.DirtyRows)
	}

	dirtyRows, err = repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows after omitted-bucket partial re-scan: %v", err)
	}
	if len(dirtyRows) != 1 {
		t.Fatalf("expected 1 dirty row after omitted-bucket partial re-scan, got %d", len(dirtyRows))
	}
	if dirtyRows[0].BucketStartHourUTC != recentBucket {
		t.Fatalf("expected dirty row bucket %d, got %d", recentBucket, dirtyRows[0].BucketStartHourUTC)
	}
	if dirtyRows[0].TotalTokens != 300 {
		t.Fatalf("expected dirty row total tokens 300, got %d", dirtyRows[0].TotalTokens)
	}
}

func newTestFileHourlyUsageRepository(t *testing.T) *fileHourlyUsageRepository {
	t.Helper()

	repository, err := NewFileHourlyUsageRepository(filepath.Join(t.TempDir(), "credential.yaml"))
	if err != nil {
		t.Fatalf("new repository: %v", err)
	}
	fileRepository, ok := repository.(*fileHourlyUsageRepository)
	if !ok {
		t.Fatalf("expected file repository implementation")
	}
	return fileRepository
}

func loadTestRepositoryRows(t *testing.T, repo *fileHourlyUsageRepository) []HourlyUsageRow {
	t.Helper()

	repo.mu.Lock()
	defer repo.mu.Unlock()

	state, err := repo.loadLocked()
	if err != nil {
		t.Fatalf("load repository rows: %v", err)
	}
	return append([]HourlyUsageRow(nil), state.Rows...)
}

func newHourlyUsageRow(bucketStartHourUTC int64, totalTokens int64) HourlyUsageRow {
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
		AttributionConfidence: AttributionExact,
		ScannerSourceKind:     SourceKindJSONL,
		ScannerSourceID:       "/tmp/source.jsonl",
		IngestedAt:            bucketStartHourUTC,
		RunID:                 "daemon-claude",
		UpdatedAt:             bucketStartHourUTC,
	}
}
