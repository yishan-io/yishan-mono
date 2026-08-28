package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_022CreatesBackgroundJobs(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough018(t, database)
	applyMigrationFixture(t, database, "022_background_jobs.sql")
	assert019BackgroundJobSchema(t, database)
	assertMigrationCount(t, database, 19)
}

func applyMigrationsThrough018(t *testing.T, database *sql.DB) {
	t.Helper()
	applyMigrationsThrough010(t, database)
	for _, name := range []string{"011_remove_local_task_link_role.sql", "012_local_task_tags.sql", "013_local_task_tag_catalog.sql", "014_local_task_tag_custom_color.sql", "015_local_task_tag_ids.sql", "016_local_task_tag_color_hex.sql", "017_local_task_organization_context.sql", "018_local_task_status_lifecycle.sql"} {
		applyMigrationFixture(t, database, name)
	}
}

func assert019BackgroundJobSchema(t *testing.T, database *sql.DB) {
	t.Helper()
	assertTableExists(t, database, "background_jobs")
	assertIndexExists(t, database, "idx_background_jobs_workspace_created")
	assertIndexExists(t, database, "idx_background_jobs_recovery")
	seed019Workspace(t, database)
	insert019BackgroundJob(t, database, "job-1", "session-1", "queued", "", "", "")
	assert019RejectsInvalidRows(t, database)
	assert019RejectsMismatchedWorkspaceOwnership(t, database)
}

func seed019Workspace(t *testing.T, database *sql.DB) {
	t.Helper()
	_, err := database.Exec(`INSERT INTO workspaces
		(id, organization_id, project_id, node_id, kind, status, local_path, state)
		VALUES ('workspace-1', 'org-1', 'project-1', 'node-1', 'primary', 'active', '/tmp/workspace-1', 'active')`)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
}

func insert019BackgroundJob(t *testing.T, database *sql.DB, id, sessionID, status, resultText, errorCode, errorMessage string) {
	t.Helper()
	_, err := database.Exec(`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id,
		owner_node_id, session_id, cwd, prompt, model, status, result_text, error_code, error_message)
		VALUES (?, 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'org-1', 'node-1', ?, '/tmp/workspace', 'Do work', 'model-1', ?, ?, ?, ?)`,
		id, sessionID, status, resultText, errorCode, errorMessage)
	if err != nil {
		t.Fatalf("insert background job: %v", err)
	}
}

func assert019RejectsInvalidRows(t *testing.T, database *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('bad-kind', 'other', 'dsh', 'workspace-1', 'project-1', 'org-1', 'node-1', 's-2', 'cwd', 'prompt', 'model', 'queued')`,
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('bad-status', 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'org-1', 'node-1', 's-3', 'cwd', 'prompt', 'model', 'other')`,
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('duplicate-session', 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'org-1', 'node-1', 'session-1', 'cwd', 'prompt', 'model', 'queued')`,
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status, result_text) VALUES ('long-result', 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'org-1', 'node-1', 's-4', 'cwd', 'prompt', 'model', 'queued', zeroblob(65537))`,
	} {
		if _, err := database.Exec(statement); err == nil {
			t.Fatalf("expected constrained insert to fail: %s", statement)
		}
	}
}

func assert019RejectsMismatchedWorkspaceOwnership(t *testing.T, database *sql.DB) {
	t.Helper()
	for _, statement := range []string{
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('wrong-project', 'workspace-task-run', 'dsh', 'workspace-1', 'other-project', 'org-1', 'node-1', 'session-project', 'cwd', 'prompt', 'model', 'queued')`,
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('wrong-organization', 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'other-org', 'node-1', 'session-organization', 'cwd', 'prompt', 'model', 'queued')`,
		`INSERT INTO background_jobs (id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id, session_id, cwd, prompt, model, status) VALUES ('wrong-node', 'workspace-task-run', 'dsh', 'workspace-1', 'project-1', 'org-1', 'other-node', 'session-node', 'cwd', 'prompt', 'model', 'queued')`,
	} {
		if _, err := database.Exec(statement); err == nil {
			t.Fatalf("expected ownership mismatch to fail: %s", statement)
		}
	}
}
