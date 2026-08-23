package sqlite

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"
)

func TestMigrate_011RemovesLinkRoleAndPreservesLinks(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)

	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	assert011Schema(t, database)
	assert011LinksPreserved(t, database)
	assert011ForeignKeysAndActivePair(t, database)
	assertMigrationCount(t, database, 11)
}

func TestMigrate_013AddsTagCatalogAndBackfillsExistingTags(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)
	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	applyMigrationFixture(t, database, "012_local_task_tags.sql")
	seedPre013Tags(t, database)

	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade through 012: %v", err)
	}
	assert012Schema(t, database)
	assert012ExistingDataPreserved(t, database)
	assert013CatalogBackfill(t, database)
	assertMigrationCount(t, database, 14)

	if err := Migrate(database); err != nil {
		t.Fatalf("rerun migration: %v", err)
	}
	assertMigrationCount(t, database, 14)
	assert012ExistingDataPreserved(t, database)
	assert013CatalogBackfill(t, database)
	assert012TagConstraintsAndCascade(t, database)
	assert013ColorConstraint(t, database)
}

func openMigrationTestDatabase(t *testing.T) *sql.DB {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func applyMigrationsThrough010(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`); err != nil {
		t.Fatalf("create migration table: %v", err)
	}
	for _, name := range migrationNamesThrough010 {
		applyMigrationFixture(t, database, name)
	}
}

var migrationNamesThrough010 = []string{
	"001_initial.sql", "002_workspace_live_unique.sql", "003_token_usage_hourly.sql",
	"004_token_usage_hourly_cost.sql", "005_token_usage_hourly_cost_source.sql",
	"006_pending_workspace_cleanups.sql", "007_drop_projects_fk_and_table.sql",
	"008_local_folder_workspaces.sql", "009_pending_workspace_cleanup_summary.sql", "010_local_tasks.sql",
}

func applyMigrationFixture(t *testing.T, database *sql.DB, name string) {
	t.Helper()
	migrationSQL, err := migrationFiles.ReadFile(filepath.Join("migrations", name))
	if err != nil {
		t.Fatalf("read migration %s: %v", name, err)
	}
	if _, err := database.Exec(string(migrationSQL)); err != nil {
		t.Fatalf("apply migration %s: %v", name, err)
	}
	if _, err := database.Exec(`INSERT INTO _migrations (name) VALUES (?)`, name); err != nil {
		t.Fatalf("record migration %s: %v", name, err)
	}
}

func seedPre011WorkspaceLinks(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`INSERT INTO workspaces (id, node_id, kind, status, local_path, state) VALUES ('workspace-1', 'node-1', 'folder', 'active', '/tmp/workspace-1', 'active')`); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	for _, taskID := range []string{"task-active", "task-paused", "task-completed", "task-unlinked"} {
		if _, err := database.Exec(`INSERT INTO local_tasks (id, title, status, priority) VALUES (?, ?, 'active', 'medium')`, taskID, taskID); err != nil {
			t.Fatalf("seed task %s: %v", taskID, err)
		}
	}
	links := []struct{ id, taskID, role, status, linkedAt, unlinkedAt string }{
		{"link-active", "task-active", "primary", "active", "2026-08-20 01:00:00", ""},
		{"link-paused", "task-paused", "related", "paused", "2026-08-20 02:00:00", ""},
		{"link-completed", "task-completed", "related", "completed", "2026-08-20 03:00:00", ""},
		{"link-unlinked", "task-unlinked", "related", "completed", "2026-08-20 04:00:00", "2026-08-21 04:00:00"},
	}
	for _, link := range links {
		if _, err := database.Exec(`INSERT INTO local_task_workspace_links (id, local_task_id, workspace_id, role, status, linked_at, unlinked_at) VALUES (?, ?, 'workspace-1', ?, ?, ?, NULLIF(?, ''))`, link.id, link.taskID, link.role, link.status, link.linkedAt, link.unlinkedAt); err != nil {
			t.Fatalf("seed link %s: %v", link.id, err)
		}
	}
}

func assert011Schema(t *testing.T, database *sql.DB) {
	t.Helper()
	assertColumnAbsent(t, database, "local_task_workspace_links", "role")
	assertIndexAbsent(t, database, "idx_local_task_workspace_active_primary")
	assertIndexExists(t, database, "idx_local_task_workspace_links_task")
	assertIndexExists(t, database, "idx_local_task_workspace_links_workspace")
	assertIndexExists(t, database, "idx_local_task_workspace_active_link")
}

func assert011LinksPreserved(t *testing.T, database *sql.DB) {
	t.Helper()
	rows, err := database.Query(`SELECT id, local_task_id, workspace_id, status, linked_at, COALESCE(unlinked_at, '') FROM local_task_workspace_links ORDER BY id`)
	if err != nil {
		t.Fatalf("query upgraded links: %v", err)
	}
	defer rows.Close()
	want := map[string]string{
		"link-active":    "task-active|workspace-1|active|2026-08-20 01:00:00|",
		"link-paused":    "task-paused|workspace-1|paused|2026-08-20 02:00:00|",
		"link-completed": "task-completed|workspace-1|completed|2026-08-20 03:00:00|",
		"link-unlinked":  "task-unlinked|workspace-1|completed|2026-08-20 04:00:00|2026-08-21 04:00:00",
	}
	for rows.Next() {
		var id, taskID, workspaceID, status, linkedAt, unlinkedAt string
		if err := rows.Scan(&id, &taskID, &workspaceID, &status, &linkedAt, &unlinkedAt); err != nil {
			t.Fatalf("scan upgraded link: %v", err)
		}
		if got := taskID + "|" + workspaceID + "|" + status + "|" + linkedAt + "|" + unlinkedAt; got != want[id] {
			t.Fatalf("link %s = %q, want %q", id, got, want[id])
		}
		delete(want, id)
	}
	if err := rows.Err(); err != nil || len(want) != 0 {
		t.Fatalf("iterate upgraded links: %v; missing = %#v", err, want)
	}
}

func assert011ForeignKeysAndActivePair(t *testing.T, database *sql.DB) {
	t.Helper()
	assertForeignKeyCheckEmpty(t, database)
	if _, err := database.Exec(`INSERT INTO local_task_workspace_links (id, local_task_id, workspace_id, status) VALUES ('duplicate', 'task-active', 'workspace-1', 'active')`); err == nil {
		t.Fatal("expected duplicate active pair to fail")
	}
	if _, err := database.Exec(`INSERT INTO local_task_workspace_links (id, local_task_id, workspace_id, status) VALUES ('bad-fk', 'missing-task', 'workspace-1', 'active')`); err == nil {
		t.Fatal("expected local task foreign key to fail")
	}
	if _, err := database.Exec(`INSERT INTO local_task_workspace_links (id, local_task_id, workspace_id, status) VALUES ('bad-workspace-fk', 'task-unlinked', 'missing-workspace', 'active')`); err == nil {
		t.Fatal("expected workspace foreign key to fail")
	}
}

func assertMigrationCount(t *testing.T, database *sql.DB, want int) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations`).Scan(&count); err != nil || count != want {
		t.Fatalf("migration count = %d, %v; want %d", count, err, want)
	}
}

func assertColumnAbsent(t *testing.T, database *sql.DB, tableName, columnName string) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, tableName, columnName).Scan(&count); err != nil || count != 0 {
		t.Fatalf("column %s.%s count = %d, %v; want absent", tableName, columnName, count, err)
	}
}

func assertIndexExists(t *testing.T, database *sql.DB, name string) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&count); err != nil || count != 1 {
		t.Fatalf("index %s count = %d, %v; want present", name, count, err)
	}
}

func assertIndexAbsent(t *testing.T, database *sql.DB, name string) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?`, name).Scan(&count); err != nil || count != 0 {
		t.Fatalf("index %s count = %d, %v; want absent", name, count, err)
	}
}

func assertForeignKeyCheckEmpty(t *testing.T, database *sql.DB) {
	t.Helper()
	rows, err := database.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("foreign key check: %v", err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign key check returned violations")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate foreign key check: %v", err)
	}
}

func assert012Schema(t *testing.T, database *sql.DB) {
	t.Helper()
	assertTableExists(t, database, "local_task_tags")
	for _, column := range []string{"local_task_id", "tag", "normalized_tag", "position", "created_at"} {
		assertColumnExists(t, database, "local_task_tags", column)
	}
	assertIndexExists(t, database, "idx_local_task_tags_normalized_task")
}

func assert012ExistingDataPreserved(t *testing.T, database *sql.DB) {
	t.Helper()
	assert011LinksPreserved(t, database)
	var taskCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_tasks`).Scan(&taskCount); err != nil || taskCount != 4 {
		t.Fatalf("local task count = %d, %v; want 4", taskCount, err)
	}
	var tagCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tags`).Scan(&tagCount); err != nil || tagCount != 3 {
		t.Fatalf("local task tag count = %d, %v; want 3", tagCount, err)
	}
	assertForeignKeyCheckEmpty(t, database)
}

func assert012TagConstraintsAndCascade(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position) VALUES ('task-active', 'Alpha', 'alpha', 0)`); err != nil {
		t.Fatalf("insert tag: %v", err)
	}
	for _, query := range []string{
		`INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position) VALUES ('task-active', 'ALPHA', 'alpha', 1)`,
		`INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position) VALUES ('task-active', 'Beta', 'beta', 0)`,
		`INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position) VALUES ('missing-task', 'Beta', 'beta', 0)`,
	} {
		if _, err := database.Exec(query); err == nil {
			t.Fatalf("expected constrained insert to fail: %s", query)
		}
	}
	if _, err := database.Exec(`DELETE FROM local_task_workspace_links WHERE local_task_id = 'task-active'`); err != nil {
		t.Fatalf("remove task links before task deletion: %v", err)
	}
	if _, err := database.Exec(`DELETE FROM local_tasks WHERE id = 'task-active'`); err != nil {
		t.Fatalf("delete task with tags: %v", err)
	}
	var tagCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tags WHERE local_task_id = 'task-active'`).Scan(&tagCount); err != nil || tagCount != 0 {
		t.Fatalf("cascaded tag count = %d, %v; want 0", tagCount, err)
	}
	assertForeignKeyCheckEmpty(t, database)
}

func seedPre013Tags(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position)
		VALUES ('task-unlinked', 'Later', 'alpha', 0), ('task-paused', 'First', 'alpha', 1),
		('task-completed', 'Beta', 'beta', 0)`); err != nil {
		t.Fatalf("seed pre-013 tags: %v", err)
	}
}

func assert013CatalogBackfill(t *testing.T, database *sql.DB) {
	t.Helper()
	assertTableExists(t, database, "local_task_tag_catalog")
	assertTableExists(t, database, "local_task_tag_catalog_aliases")
	rows, err := database.Query(`SELECT normalized_tag, tag, color FROM local_task_tag_catalog ORDER BY normalized_tag`)
	if err != nil {
		t.Fatalf("query catalog: %v", err)
	}
	defer rows.Close()
	var entries []string
	for rows.Next() {
		var key, name string
		var color *string
		if err := rows.Scan(&key, &name, &color); err != nil {
			t.Fatalf("scan catalog entry: %v", err)
		}
		if color != nil {
			t.Fatalf("catalog color for %q = %q, want null", key, *color)
		}
		entries = append(entries, key+"|"+name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate catalog entries: %v", err)
	}
	if got, want := fmt.Sprint(entries), "[alpha|First beta|Beta]"; got != want {
		t.Fatalf("catalog entries = %s, want %s", got, want)
	}
	aliasRows, err := database.Query(`SELECT normalized_tag, tag FROM local_task_tag_catalog_aliases ORDER BY normalized_tag, tag`)
	if err != nil {
		t.Fatalf("query catalog aliases: %v", err)
	}
	defer aliasRows.Close()
	var aliases []string
	for aliasRows.Next() {
		var key, name string
		if err := aliasRows.Scan(&key, &name); err != nil {
			t.Fatalf("scan catalog alias: %v", err)
		}
		aliases = append(aliases, key+"|"+name)
	}
	if err := aliasRows.Err(); err != nil {
		t.Fatalf("iterate catalog aliases: %v", err)
	}
	if got, want := fmt.Sprint(aliases), "[alpha|First alpha|Later beta|Beta]"; got != want {
		t.Fatalf("catalog aliases = %s, want %s", got, want)
	}
}

func assert013ColorConstraint(t *testing.T, database *sql.DB) {
	t.Helper()
	for _, color := range []any{"amber", "blue", "green", "purple", "red", "teal", nil} {
		if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (normalized_tag, tag, color) VALUES (?, ?, ?)`,
			fmt.Sprintf("color-%v", color), "Color", color); err != nil {
			t.Fatalf("insert valid catalog color %v: %v", color, err)
		}
	}
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (normalized_tag, tag, color) VALUES ('color-invalid', 'Color', 'magenta')`); err == nil {
		t.Fatal("expected invalid catalog color to fail")
	}
}
