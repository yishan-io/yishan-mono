package db

import (
	"context"
	"testing"
)

func TestProjectMigrationStatusComplete_AcceptsLegacyMarker(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy migration marker: %v", err)
	}

	complete, err := ProjectMigrationStatusComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("ProjectMigrationStatusComplete: %v", err)
	}
	if !complete {
		t.Fatal("expected legacy project migration marker to satisfy status")
	}
}

func TestUsageMigrationStatusComplete_AcceptsLegacyMarker(t *testing.T) {
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

	complete, err := UsageMigrationStatusComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("UsageMigrationStatusComplete: %v", err)
	}
	if !complete {
		t.Fatal("expected legacy usage migration marker to satisfy status")
	}
}

func TestExportV1MigrationComplete_DoesNotTreatLegacyMarkersAsRerunComplete(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy project migration marker: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	projectsComplete, err := ProjectExportV1MigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("ProjectExportV1MigrationComplete: %v", err)
	}
	if projectsComplete {
		t.Fatal("did not expect legacy project marker to satisfy export-v1 rerun status")
	}
	usageComplete, err := UsageExportV1MigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("UsageExportV1MigrationComplete: %v", err)
	}
	if usageComplete {
		t.Fatal("did not expect legacy usage marker to satisfy export-v1 rerun status")
	}
}
