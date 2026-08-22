package sqlite

import (
	"context"
	"database/sql"
	"os"
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
	assertTableExists(t, database, "workspaces")
	assertTableExists(t, database, "workspace_pull_requests")
	assertTableExists(t, database, "_metadata")
	assertTableExists(t, database, "token_usage_hourly")
	assertTableExists(t, database, "local_tasks")
	assertTableExists(t, database, "local_task_tags")
	assertTableExists(t, database, "local_task_workspace_links")
	assertTableExists(t, database, "local_tasks_fts")
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
	if migrationCount != 12 {
		t.Fatalf("expected twelve applied migrations, got %d", migrationCount)
	}
}

func TestMigrate_CleansUpLegacyMetadataKeys(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	legacyKeys := append(append([]string{}, legacyRemoteToLocalMarkerKeys...), legacyUsageMetadataKeys...)
	for _, key := range legacyKeys {
		if err := setMetadataKey(context.Background(), database, key, "true"); err != nil {
			t.Fatalf("seed legacy marker %q: %v", key, err)
		}
	}
	if err := setMetadataKey(context.Background(), database, "token_usage_cost_backfill_started_at", "1780000000000"); err != nil {
		t.Fatalf("seed backfill started-at: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, "token_usage_cost_backfill_completed", "v4"); err != nil {
		t.Fatalf("seed backfill completed: %v", err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("second migration: %v", err)
	}

	for _, key := range legacyKeys {
		exists, err := MetadataKeyExists(context.Background(), database, key)
		if err != nil {
			t.Fatalf("read legacy marker %q: %v", key, err)
		}
		if exists {
			t.Fatalf("expected legacy marker %q to be cleaned up", key)
		}
	}
	for _, activeKey := range []string{"token_usage_cost_backfill_started_at", "token_usage_cost_backfill_completed"} {
		exists, err := MetadataKeyExists(context.Background(), database, activeKey)
		if err != nil {
			t.Fatalf("read active key %q: %v", activeKey, err)
		}
		if !exists {
			t.Fatalf("expected active key %q to be preserved", activeKey)
		}
	}
}

func TestCleanupLegacyProfileFiles_RemovesLegacyFiles(t *testing.T) {
	profileDir := t.TempDir()
	for _, name := range legacyProfileFileNames {
		if err := os.WriteFile(filepath.Join(profileDir, name), []byte(`{}`), 0o600); err != nil {
			t.Fatalf("seed legacy file %q: %v", name, err)
		}
	}
	// Non-legacy files must survive cleanup.
	survivorPath := filepath.Join(profileDir, "settings.yaml")
	if err := os.WriteFile(survivorPath, []byte(`default_org_id: org-1`), 0o600); err != nil {
		t.Fatalf("seed survivor file: %v", err)
	}

	if err := CleanupLegacyProfileFiles(profileDir); err != nil {
		t.Fatalf("cleanup legacy profile files: %v", err)
	}

	for _, name := range legacyProfileFileNames {
		if _, err := os.Stat(filepath.Join(profileDir, name)); !os.IsNotExist(err) {
			t.Fatalf("expected legacy profile file %q to be removed", name)
		}
	}
	if _, err := os.Stat(survivorPath); err != nil {
		t.Fatalf("expected non-legacy file %q to survive cleanup", survivorPath)
	}
}

func TestCleanupLegacyProfileFiles_IgnoresMissingFiles(t *testing.T) {
	if err := CleanupLegacyProfileFiles(t.TempDir()); err != nil {
		t.Fatalf("cleanup with no legacy files: %v", err)
	}
	if err := CleanupLegacyProfileFiles(""); err != nil {
		t.Fatalf("cleanup with empty profile dir: %v", err)
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

func TestMigrate_008_UpgradesWorkspacesForFolderWorkspaces(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()

	// Simulate an existing DB that has been migrated through 007 by creating the
	// migration table and applying the migrations up to 007.
	if _, err := database.Exec(`CREATE TABLE IF NOT EXISTS _migrations (
		name TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		t.Fatalf("create migration table: %v", err)
	}
	for _, migrationName := range []string{
		"001_initial.sql", "002_workspace_live_unique.sql", "003_token_usage_hourly.sql",
		"004_token_usage_hourly_cost.sql", "005_token_usage_hourly_cost_source.sql",
		"006_pending_workspace_cleanups.sql", "007_drop_projects_fk_and_table.sql",
	} {
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

	// Seed an existing remote-backed workspace row that must survive the rebuild.
	if _, err := database.Exec(`INSERT INTO workspaces
		(id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state)
		VALUES ('ws-1', 'org-1', 'project-1', 'node-1', 'worktree', 'active', NULL, NULL, '/tmp/existing', 'active')`); err != nil {
		t.Fatalf("seed existing workspace: %v", err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade migrate: %v", err)
	}

	// 008 must have been recorded as applied (its schema effects below confirm it ran).
	var eightApplied int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations WHERE name = '008_local_folder_workspaces.sql'`).Scan(&eightApplied); err != nil {
		t.Fatalf("check 008 applied: %v", err)
	}
	if eightApplied != 1 {
		t.Fatalf("expected 008 migration recorded, got %d", eightApplied)
	}

	// project_id / organization_id are now nullable.
	for _, column := range []string{"project_id", "organization_id"} {
		assertColumnNullable(t, database, "workspaces", column)
	}

	// Existing row preserved.
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM workspaces WHERE id = 'ws-1'`).Scan(&count); err != nil {
		t.Fatalf("count preserved workspace: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected existing workspace preserved, got %d", count)
	}

	// Folder rows (project_id NULL) on the same node do not collide on the
	// live unique index.
	for _, folderID := range []string{"folder-1", "folder-2"} {
		if _, err := database.Exec(`INSERT INTO workspaces
			(id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state)
			VALUES (?, NULL, NULL, 'node-9', 'folder', 'active', NULL, NULL, ?, 'active')`,
			folderID, "/tmp/folder-"+folderID); err != nil {
			t.Fatalf("insert folder workspace %s: %v", folderID, err)
		}
	}
}

func assertColumnNullable(t *testing.T, database *sql.DB, tableName string, columnName string) {
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
			if notNull != 0 {
				t.Fatalf("expected column %q on table %q to be nullable", columnName, tableName)
			}
			return
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate table info for %q: %v", tableName, err)
	}
	t.Fatalf("expected column %q on table %q", columnName, tableName)
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
