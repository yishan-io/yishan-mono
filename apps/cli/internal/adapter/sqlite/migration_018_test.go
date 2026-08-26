package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_018ReplacesLocalTaskLifecycleStatuses(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough016(t, database)
	applyMigrationFixture(t, database, "017_local_task_organization_context.sql")
	seed018LegacyLifecycleRows(t, database)

	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	assert018TaskStatuses(t, database)
	assert018LinksMapped(t, database)
	assertMigrationCount(t, database, 18)
}

func seed018LegacyLifecycleRows(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`INSERT INTO workspaces (id, node_id, kind, status, local_path, state)
		VALUES ('workspace-1', 'node-1', 'folder', 'active', '/tmp/workspace-1', 'active')`); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO local_tasks (id, title, status, priority, completed_at) VALUES
		('task-active', 'Active', 'active', 'medium', 'old-date'),
		('task-paused', 'Paused', 'paused', 'medium', 'old-date'),
		('task-completed', 'Completed', 'completed', 'medium', 'done-date'),
		('task-unlinked', 'Unlinked', 'completed', 'medium', 'unlinked-date')`); err != nil {
		t.Fatalf("seed tasks: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO local_task_workspace_links (id, local_task_id, workspace_id, status) VALUES
		('link-active', 'task-active', 'workspace-1', 'active'),
		('link-paused', 'task-paused', 'workspace-1', 'paused'),
		('link-completed', 'task-completed', 'workspace-1', 'completed'),
		('link-unlinked', 'task-unlinked', 'workspace-1', 'completed')`); err != nil {
		t.Fatalf("seed links: %v", err)
	}
}

func assert018TaskStatuses(t *testing.T, database *sql.DB) {
	t.Helper()
	rows, err := database.Query(`SELECT id, status, COALESCE(completed_at, '') FROM local_tasks ORDER BY id`)
	if err != nil {
		t.Fatalf("query tasks: %v", err)
	}
	defer rows.Close()
	want := map[string]string{"task-active": "progressing|", "task-paused": "cancelled|", "task-completed": "done|done-date", "task-unlinked": "done|unlinked-date"}
	for rows.Next() {
		var id, status, completedAt string
		if err := rows.Scan(&id, &status, &completedAt); err != nil {
			t.Fatalf("scan task: %v", err)
		}
		if got := status + "|" + completedAt; got != want[id] {
			t.Fatalf("task %s = %q, want %q", id, got, want[id])
		}
		delete(want, id)
	}
	if err := rows.Err(); err != nil || len(want) != 0 {
		t.Fatalf("iterate tasks: %v; missing = %#v", err, want)
	}
}
