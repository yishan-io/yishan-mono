package db

import (
	"context"
	"database/sql"
	"testing"
)

func TestMigrateUsageFromAPI_ImportsExportedUsageRows(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {newExportUsageRow(21)},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	state, err := NewHourlyUsageStore(database).GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get usage sync state: %v", err)
	}
	if state.TotalRows != 1 || state.DirtyRows != 0 {
		t.Fatalf("expected one clean imported row, got %#v", state)
	}
	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationUsageAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read usage migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected usage migration marker")
	}
}

func TestMigrateUsageFromAPI_PreservesCleanLocalRowsWhenExportIsStale(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := parseTimestampMillis("2026-07-31T10:00:00.000Z")
	cleanRow := newTestHourlyUsageRow(bucketStart, 120)
	cleanRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{cleanRow}); err != nil {
		t.Fatalf("seed clean row: %v", err)
	}
	cleanDirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list clean dirty rows: %v", err)
	}
	if len(cleanDirtyRows) != 1 {
		t.Fatalf("expected one dirty row before sync, got %#v", cleanDirtyRows)
	}
	syncedAt := bucketStart + 2_000
	if err := store.MarkHourlyRowsSynced(context.Background(), cleanDirtyRows, syncedAt); err != nil {
		t.Fatalf("mark clean row synced: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {newExportUsageRow(80)},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	storedRow := lookupStoredUsageRow(t, database, cleanRow)
	if storedRow.TotalTokens != cleanRow.TotalTokens {
		t.Fatalf("expected stale import rerun to preserve clean total tokens %d, got %#v", cleanRow.TotalTokens, storedRow)
	}
	if storedRow.LastSyncedAt != syncedAt {
		t.Fatalf("expected stale import rerun to preserve lastSyncedAt %d, got %#v", syncedAt, storedRow)
	}
	if storedRow.ScannerSourceKind != cleanRow.ScannerSourceKind || storedRow.ScannerSourceID != cleanRow.ScannerSourceID {
		t.Fatalf("expected stale import rerun to preserve scanner provenance, got %#v", storedRow)
	}
}

func TestMigrateUsageFromAPI_RefreshesCleanLocalRowsWhenExportIsNewer(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := parseTimestampMillis("2026-07-31T10:00:00.000Z")
	cleanRow := newTestHourlyUsageRow(bucketStart, 80)
	cleanRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{cleanRow}); err != nil {
		t.Fatalf("seed clean row: %v", err)
	}
	cleanDirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list clean dirty rows: %v", err)
	}
	if len(cleanDirtyRows) != 1 {
		t.Fatalf("expected one dirty row before sync, got %#v", cleanDirtyRows)
	}
	syncedAt := bucketStart + 2_000
	if err := store.MarkHourlyRowsSynced(context.Background(), cleanDirtyRows, syncedAt); err != nil {
		t.Fatalf("mark clean row synced: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {newExportUsageRow(120)},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	storedRow := lookupStoredUsageRow(t, database, cleanRow)
	if storedRow.TotalTokens != 120 {
		t.Fatalf("expected newer import rerun to update clean total tokens, got %#v", storedRow)
	}
	if storedRow.LastSyncedAt != syncedAt {
		t.Fatalf("expected newer import rerun to preserve lastSyncedAt %d, got %#v", syncedAt, storedRow)
	}
	if storedRow.ScannerSourceKind != "" || storedRow.ScannerSourceID != "" {
		t.Fatalf("expected newer import rerun to use remote provenance fields, got %#v", storedRow)
	}
}

func TestMigrateUsageFromAPI_PreservesDirtyLocalRowsWhenLegacyMarkerTriggersRerun(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	store := NewHourlyUsageStore(database)
	bucketStart := parseTimestampMillis("2026-07-31T10:00:00.000Z")
	initialRow := newTestHourlyUsageRow(bucketStart, 100)
	initialRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{initialRow}); err != nil {
		t.Fatalf("seed initial row: %v", err)
	}
	initialDirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list initial dirty rows: %v", err)
	}
	if len(initialDirtyRows) != 1 {
		t.Fatalf("expected one initial dirty row, got %#v", initialDirtyRows)
	}
	syncedAt := bucketStart + 1_000
	if err := store.MarkHourlyRowsSynced(context.Background(), initialDirtyRows, syncedAt); err != nil {
		t.Fatalf("mark initial row synced: %v", err)
	}

	updatedDirtyRow := newTestHourlyUsageRow(bucketStart, 120)
	updatedDirtyRow.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{updatedDirtyRow}); err != nil {
		t.Fatalf("seed updated dirty row: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {newExportUsageRow(80)},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	dirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	if len(dirtyRows) != 1 {
		t.Fatalf("expected one dirty row after rerun, got %#v", dirtyRows)
	}
	if dirtyRows[0].TotalTokens != updatedDirtyRow.TotalTokens {
		t.Fatalf("expected rerun to preserve dirty total tokens %d, got %#v", updatedDirtyRow.TotalTokens, dirtyRows[0])
	}
	if dirtyRows[0].LastSyncedAt != syncedAt {
		t.Fatalf("expected rerun to preserve lastSyncedAt %d, got %#v", syncedAt, dirtyRows[0])
	}
	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationUsageAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read usage migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected export-based usage migration marker")
	}
}

func TestMigrateUsageFromAPI_IgnoresLegacyCompletionMarker(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {newExportUsageRow(21)},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationUsageAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read usage migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected export-based usage migration marker")
	}
	state, err := NewHourlyUsageStore(database).GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get usage sync state: %v", err)
	}
	if state.TotalRows != 1 {
		t.Fatalf("expected legacy marker to be ignored and usage row imported, got %#v", state)
	}
}

func newExportUsageRow(totalTokens int64) APIHourlyUsageRow {
	return APIHourlyUsageRow{
		ProjectID:             "project-1",
		WorkspaceID:           "workspace-1",
		WorkspacePath:         "/tmp/workspace",
		OrganizationID:        "org-1",
		AgentKind:             "claude",
		Model:                 "claude-opus-4-6",
		ModelNormalized:       "claude-opus-4-6",
		BucketStartHourUTC:    "2026-07-31T10:00:00.000Z",
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
		IngestedAt:            "2026-07-31T10:30:00.000Z",
		RunID:                 "run-1",
	}
}

func lookupStoredUsageRow(t *testing.T, database *sql.DB, row HourlyUsageRow) HourlyUsageRow {
	t.Helper()

	lookupRow := HourlyUsageRow{
		ProjectID:          row.ProjectID,
		WorkspaceID:        row.WorkspaceID,
		AgentKind:          row.AgentKind,
		ModelNormalized:    row.ModelNormalized,
		BucketStartHourUTC: row.BucketStartHourUTC,
	}
	tx, err := database.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback()
	storedRow, hasStoredRow, err := lookupHourlyUsageRow(context.Background(), tx, lookupRow)
	if err != nil {
		t.Fatalf("lookup stored row: %v", err)
	}
	if !hasStoredRow {
		t.Fatal("expected stored usage row")
	}
	return storedRow
}
