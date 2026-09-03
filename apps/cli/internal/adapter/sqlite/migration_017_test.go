package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_017AddsOptionalLocalTaskOrganizationContext(t *testing.T) {
	database := openMigrationTestDatabase(t)
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	assertMigrationCount(t, database, 21)
	assertColumnExists(t, database, "local_tasks", "organization_id")
	if _, err := database.Exec(`INSERT INTO local_tasks (id, title, status, priority) VALUES ('historical-task', 'Historical', 'new', 'medium')`); err != nil {
		t.Fatalf("insert historical task without organization context: %v", err)
	}
}

func TestMigrate_017BackfillsOrganizationFromPersistedWorkspaceProject(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough016(t, database)
	if _, err := database.Exec(`INSERT INTO workspaces (id, organization_id, project_id, node_id, kind, status, local_path, state)
		VALUES ('workspace-1', 'organization-1', 'project-1', 'node-1', 'folder', 'active', '/tmp/workspace-1', 'active')`); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO local_tasks (id, project_id, title, status, priority) VALUES
		('resolved-task', 'project-1', 'Resolved', 'active', 'medium'),
		('unresolved-task', 'missing-project', 'Unresolved', 'active', 'medium')`); err != nil {
		t.Fatalf("seed local tasks: %v", err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	var organizationID *string
	if err := database.QueryRow(`SELECT organization_id FROM local_tasks WHERE id = 'resolved-task'`).Scan(&organizationID); err != nil || organizationID == nil || *organizationID != "organization-1" {
		t.Fatalf("resolved task organization = %v, %v; want organization-1", organizationID, err)
	}
	if err := database.QueryRow(`SELECT organization_id FROM local_tasks WHERE id = 'unresolved-task'`).Scan(&organizationID); err != nil || organizationID != nil {
		t.Fatalf("unresolved task organization = %v, %v; want null", organizationID, err)
	}
}

func applyMigrationsThrough016(t *testing.T, database *sql.DB) {
	t.Helper()
	applyMigrationsThrough010(t, database)
	for _, name := range []string{
		"011_remove_local_task_link_role.sql", "012_local_task_tags.sql", "013_local_task_tag_catalog.sql",
		"014_local_task_tag_custom_color.sql", "015_local_task_tag_ids.sql", "016_local_task_tag_color_hex.sql",
	} {
		applyMigrationFixture(t, database, name)
	}
}
