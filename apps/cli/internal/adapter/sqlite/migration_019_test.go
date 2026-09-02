package sqlite

import "testing"

func TestMigrate_019AddsNullableLocalTaskKeyWithoutChangingLegacyRows(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough016(t, database)
	applyMigrationFixture(t, database, "017_local_task_organization_context.sql")
	applyMigrationFixture(t, database, "018_local_task_status_lifecycle.sql")
	if _, err := database.Exec(`INSERT INTO local_tasks (id, title, status, priority) VALUES ('legacy', 'Legacy', 'new', 'medium')`); err != nil {
		t.Fatalf("seed legacy task: %v", err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	assertColumnExists(t, database, "local_tasks", "task_key")
	var taskKey *string
	if err := database.QueryRow(`SELECT task_key FROM local_tasks WHERE id = 'legacy'`).Scan(&taskKey); err != nil || taskKey != nil {
		t.Fatalf("legacy task key = %v, %v; want null", taskKey, err)
	}
}
