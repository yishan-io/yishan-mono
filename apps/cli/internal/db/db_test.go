package db

import (
	"database/sql"
	"path/filepath"
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
	if migrationCount != 5 {
		t.Fatalf("expected five applied migrations, got %d", migrationCount)
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

func TestMigrate_UpgradesExistingTokenUsageSchema(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()

	if _, err := database.Exec(`CREATE TABLE IF NOT EXISTS _migrations (
		name TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		t.Fatalf("create migration table: %v", err)
	}
	for _, migrationName := range []string{"001_initial.sql", "002_workspace_live_unique.sql", "003_token_usage_hourly.sql"} {
		migrationSQL, err := migrationFiles.ReadFile(filepath.Join("migrations", migrationName))
		if err != nil {
			t.Fatalf("read migration %s: %v", migrationName, err)
		}
		if _, err := database.Exec(string(migrationSQL)); err != nil {
			t.Fatalf("apply migration %s: %v", migrationName, err)
		}
		if _, err := database.Exec(`INSERT INTO _migrations (name) VALUES (?)`, migrationName); err != nil {
			t.Fatalf("record migration %s: %v", migrationName, err)
		}
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade migrate: %v", err)
	}
	assertColumnExists(t, database, "token_usage_hourly", "total_cost_micros_usd")
	assertColumnExists(t, database, "token_usage_hourly", "cost_source")
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

func assertColumnExists(t *testing.T, database *sql.DB, tableName string, columnName string) {
	t.Helper()

	rows, err := database.Query(`PRAGMA table_info(` + tableName + `)`)
	if err != nil {
		t.Fatalf("read table info for %q: %v", tableName, err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatalf("scan table info for %q: %v", tableName, err)
		}
		if name == columnName {
			return
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table info for %q: %v", tableName, err)
	}
	t.Fatalf("expected column %q on table %q", columnName, tableName)
}
