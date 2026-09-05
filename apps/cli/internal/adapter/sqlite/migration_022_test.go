package sqlite

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestMigrate_022CreatesBackgroundJobs(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough018(t, database)
	applyMigrationFixture(t, database, "022_background_jobs.sql")
	assert019BackgroundJobSchema(t, database)
	assertMigrationCount(t, database, 19)
}

func TestMigrate_022RecordsRenamedLegacyBackgroundJobsMigration(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough018(t, database)
	applyLegacy019BackgroundJobsFixture(t, database)

	if err := Migrate(database); err != nil {
		t.Fatalf("migrate legacy background jobs database: %v", err)
	}

	assertMigrationRecorded(t, database, "022_background_jobs.sql")
	assert019BackgroundJobSchema(t, database)
}

func TestMigrate_022RejectsMissingOrAlteredLegacyBackgroundJobsSchema(t *testing.T) {
	testCases := []struct {
		name        string
		changeSQL   string
		wantErrPart string
	}{
		{name: "missing table", changeSQL: `DROP TABLE background_jobs`, wantErrPart: `missing table "background_jobs"`},
		{name: "missing workspace index", changeSQL: `DROP INDEX idx_background_jobs_workspace_created`, wantErrPart: `missing index "idx_background_jobs_workspace_created"`},
		{name: "missing recovery index", changeSQL: `DROP INDEX idx_background_jobs_recovery`, wantErrPart: `missing index "idx_background_jobs_recovery"`},
		{name: "missing ownership trigger", changeSQL: `DROP TRIGGER validate_background_job_workspace_ownership`, wantErrPart: `missing trigger "validate_background_job_workspace_ownership"`},
		{name: "altered table", changeSQL: `ALTER TABLE background_jobs ADD COLUMN altered TEXT`, wantErrPart: `altered table "background_jobs"`},
		{name: "altered workspace index", changeSQL: `DROP INDEX idx_background_jobs_workspace_created; CREATE INDEX idx_background_jobs_workspace_created ON background_jobs(id)`, wantErrPart: `altered index "idx_background_jobs_workspace_created"`},
		{name: "altered recovery index", changeSQL: `DROP INDEX idx_background_jobs_recovery; CREATE INDEX idx_background_jobs_recovery ON background_jobs(id)`, wantErrPart: `altered index "idx_background_jobs_recovery"`},
		{name: "altered ownership trigger", changeSQL: `DROP TRIGGER validate_background_job_workspace_ownership; CREATE TRIGGER validate_background_job_workspace_ownership BEFORE INSERT ON background_jobs BEGIN SELECT RAISE(ABORT, 'altered'); END`, wantErrPart: `altered trigger "validate_background_job_workspace_ownership"`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			database := openMigrationTestDatabase(t)
			applyMigrationsThrough018(t, database)
			applyLegacy019BackgroundJobsFixture(t, database)
			if _, err := database.Exec(testCase.changeSQL); err != nil {
				t.Fatalf("change legacy schema: %v", err)
			}

			err := Migrate(database)
			if err == nil || !strings.Contains(err.Error(), testCase.wantErrPart) {
				t.Fatalf("migrate error = %v; want message containing %q", err, testCase.wantErrPart)
			}
			assertMigrationNotRecorded(t, database, backgroundJobsMigrationName)
		})
	}
}

func TestRecordLegacyMigrationAlias_AcceptsExistingMigrationRecord(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough018(t, database)
	applyLegacy019BackgroundJobsFixture(t, database)
	if _, err := database.Exec(`INSERT INTO _migrations (name) VALUES (?)`, backgroundJobsMigrationName); err != nil {
		t.Fatalf("record current migration: %v", err)
	}

	isRecorded, err := recordLegacyMigrationAlias(database, backgroundJobsMigrationName)
	if err != nil {
		t.Fatalf("record legacy migration alias with existing record: %v", err)
	}
	if !isRecorded {
		t.Fatal("expected existing migration record to be accepted")
	}
	assertMigrationRecorded(t, database, backgroundJobsMigrationName)
}

func TestMigrate_022RecordsLegacyAliasConcurrentlyAndIdempotently(t *testing.T) {
	profileDir := t.TempDir()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open setup database: %v", err)
	}
	applyMigrationsThrough021(t, database)
	applyLegacy019BackgroundJobsFixture(t, database)
	if err := database.Close(); err != nil {
		t.Fatalf("close setup database: %v", err)
	}

	firstDatabase := openMigrationDatabase(t, profileDir)
	secondDatabase := openMigrationDatabase(t, profileDir)
	var migrationGroup sync.WaitGroup
	errors := make(chan error, 2)
	for _, concurrentDatabase := range []*sql.DB{firstDatabase, secondDatabase} {
		migrationGroup.Add(1)
		go func(database *sql.DB) {
			defer migrationGroup.Done()
			errors <- Migrate(database)
		}(concurrentDatabase)
	}
	migrationGroup.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatalf("concurrent migration: %v", err)
		}
	}

	assertMigrationRecorded(t, firstDatabase, backgroundJobsMigrationName)
	if err := Migrate(firstDatabase); err != nil {
		t.Fatalf("repeat migration after alias recording: %v", err)
	}
	assertMigrationRecorded(t, firstDatabase, backgroundJobsMigrationName)
}

func applyMigrationsThrough021(t *testing.T, database *sql.DB) {
	t.Helper()
	applyMigrationsThrough018(t, database)
	for _, migrationName := range []string{
		"019_local_task_keys.sql", "020_local_task_key_search.sql", "021_local_task_folder_projects.sql",
	} {
		applyMigrationFixture(t, database, migrationName)
	}
}

func openMigrationDatabase(t *testing.T, profileDir string) *sql.DB {
	t.Helper()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open migration database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func applyLegacy019BackgroundJobsFixture(t *testing.T, database *sql.DB) {
	t.Helper()
	migrationSQL, err := os.ReadFile(filepath.Join("testdata", "019_background_jobs.sql"))
	if err != nil {
		t.Fatalf("read legacy 019 background jobs fixture: %v", err)
	}
	if _, err := database.Exec(string(migrationSQL)); err != nil {
		t.Fatalf("apply legacy 019 background jobs fixture: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO _migrations (name) VALUES ('019_background_jobs.sql')`); err != nil {
		t.Fatalf("record legacy 019 background jobs migration: %v", err)
	}
}

func assertMigrationNotRecorded(t *testing.T, database *sql.DB, migrationName string) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations WHERE name = ?`, migrationName).Scan(&count); err != nil || count != 0 {
		t.Fatalf("migration %q count = %d, %v; want 0", migrationName, count, err)
	}
}

func assertMigrationRecorded(t *testing.T, database *sql.DB, migrationName string) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM _migrations WHERE name = ?`, migrationName).Scan(&count); err != nil || count != 1 {
		t.Fatalf("migration %q count = %d, %v; want 1", migrationName, count, err)
	}
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
