package tokenusage

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
)

func TestMigrateLegacyJSON_ImportsRowsAndPreservesBackup(t *testing.T) {
	profileDir := t.TempDir()
	configPath := filepath.Join(profileDir, "credential.yaml")
	legacyPath := filepath.Join(profileDir, hourlyUsageFileName)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()
	legacyState := hourlyUsageFile{Rows: []HourlyUsageRow{newHourlyUsageRow(bucketStart, 42)}, LastSuccessfulSyncAt: bucketStart}
	raw, err := json.Marshal(legacyState)
	if err != nil {
		t.Fatalf("marshal legacy state: %v", err)
	}
	if err := os.WriteFile(legacyPath, raw, 0o600); err != nil {
		t.Fatalf("write legacy state: %v", err)
	}

	database, err := localdb.Open(profileDir)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := MigrateLegacyJSON(context.Background(), database, configPath); err != nil {
		t.Fatalf("migrate legacy JSON: %v", err)
	}

	store := localdb.NewHourlyUsageStore(database)
	dirtyRows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list imported rows: %v", err)
	}
	if len(dirtyRows) != 1 || dirtyRows[0].TotalTokens != 42 {
		t.Fatalf("unexpected imported rows: %#v", dirtyRows)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("expected legacy file to be renamed, stat error: %v", err)
	}
	if _, err := os.Stat(legacyPath + tokenUsageJSONMigrationSuffix); err != nil {
		t.Fatalf("expected migration backup: %v", err)
	}
}
