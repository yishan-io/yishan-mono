package db

import (
	"database/sql"
	"testing"
)

func TestOpenAndMigrate_CreatesSchemaAndConfiguresDatabase(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()

	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	assertJournalMode(t, database)
	assertForeignKeysEnabled(t, database)
	assertTableExists(t, database, "projects")
	assertTableExists(t, database, "workspaces")
	assertTableExists(t, database, "workspace_pull_requests")
	assertTableExists(t, database, "_metadata")
	assertTableExists(t, database, "token_usage_hourly")
	assertTableExists(t, database, "_migrations")
}

func TestMigrate_IsIdempotent(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()

	if err := Migrate(database); err != nil {
		t.Fatalf("first migration: %v", err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("second migration: %v", err)
	}

	var migrationCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations`).Scan(&migrationCount); err != nil {
		t.Fatalf("count migrations: %v", err)
	}
	if migrationCount != 3 {
		t.Fatalf("expected three applied migrations, got %d", migrationCount)
	}
}

func assertJournalMode(t *testing.T, database *sql.DB) {
	t.Helper()

	var journalMode string
	if err := database.QueryRow(`PRAGMA journal_mode`).Scan(&journalMode); err != nil {
		t.Fatalf("read journal mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("expected WAL journal mode, got %q", journalMode)
	}
}

func assertForeignKeysEnabled(t *testing.T, database *sql.DB) {
	t.Helper()

	var foreignKeysEnabled int
	if err := database.QueryRow(`PRAGMA foreign_keys`).Scan(&foreignKeysEnabled); err != nil {
		t.Fatalf("read foreign key setting: %v", err)
	}
	if foreignKeysEnabled != 1 {
		t.Fatalf("expected foreign keys enabled, got %d", foreignKeysEnabled)
	}
}

func assertTableExists(t *testing.T, database *sql.DB, tableName string) {
	t.Helper()

	var foundTableName string
	err := database.QueryRow(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
		tableName,
	).Scan(&foundTableName)
	if err != nil {
		t.Fatalf("find table %q: %v", tableName, err)
	}
}
