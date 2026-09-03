package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_020IndexesExistingAndUpdatedLocalTaskKeysForFTS(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough016(t, database)
	applyMigrationFixture(t, database, "017_local_task_organization_context.sql")
	applyMigrationFixture(t, database, "018_local_task_status_lifecycle.sql")
	applyMigrationFixture(t, database, "019_local_task_keys.sql")
	if _, err := database.Exec(`INSERT INTO local_tasks (id, task_key, title, status, priority) VALUES ('existing', 'TASK-438', 'Existing', 'new', 'medium')`); err != nil {
		t.Fatalf("seed keyed task: %v", err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	assertIndexExists(t, database, "idx_local_tasks_task_key")
	assertFTSKeyMatch(t, database, "TASK-438", "existing")
	if _, err := database.Exec(`UPDATE local_tasks SET task_key = 'TASK-439' WHERE id = 'existing'`); err != nil {
		t.Fatalf("update task key: %v", err)
	}
	assertFTSKeyMatch(t, database, "TASK-439", "existing")
}

func assertFTSKeyMatch(t *testing.T, database *sql.DB, key string, wantID string) {
	t.Helper()
	var taskID string
	if err := database.QueryRow(`SELECT local_task_id FROM local_tasks_fts WHERE local_tasks_fts MATCH ?`, `"`+key+`"`).Scan(&taskID); err != nil || taskID != wantID {
		t.Fatalf("FTS key %q = %q, %v; want %q", key, taskID, err, wantID)
	}
}
