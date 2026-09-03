package sqlite

import (
	"context"
	"database/sql"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestMigrate_021BackfillsOnlyLocalFolderTaskMetadataAndSurvivesWorkspaceRemoval(t *testing.T) {
	profileDir := t.TempDir()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open pre-021 database: %v", err)
	}
	applyMigrationsThrough020(t, database)
	seedPre021FolderTasks(t, database)

	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade through 021: %v", err)
	}
	assert021FolderMetadata(t, database, "local-folder-task", "Local Folder")
	assert021ProjectScopedFolderTaskIsNotClassified(t, database)
	assert021OrganizationScopedLocalFolderTaskIsNotClassified(t, database)

	if _, err := database.Exec(`DELETE FROM workspaces WHERE id = 'folder-local'`); err != nil {
		t.Fatalf("delete local folder workspace: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close upgraded database: %v", err)
	}

	reopened, err := Open(profileDir)
	if err != nil {
		t.Fatalf("reopen upgraded database: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	if err := Migrate(reopened); err != nil {
		t.Fatalf("migrate reopened database: %v", err)
	}
	store := NewLocalTaskStore(reopened)
	assert021TaskRetainedFolderMetadata(t, store)
}

func applyMigrationsThrough020(t *testing.T, database *sql.DB) {
	t.Helper()
	applyMigrationsThrough016(t, database)
	for _, name := range []string{
		"017_local_task_organization_context.sql", "018_local_task_status_lifecycle.sql",
		"019_local_task_keys.sql", "020_local_task_key_search.sql",
	} {
		applyMigrationFixture(t, database, name)
	}
}

func seedPre021FolderTasks(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec(`INSERT INTO workspaces (id, organization_id, project_id, node_id, kind, status, local_path, state, name) VALUES
		('folder-local', NULL, NULL, 'node-local', 'folder', 'active', '/tmp/folder-local', 'active', 'Local Folder'),
		('folder-project', 'org-1', 'project-1', 'node-project', 'folder', 'active', '/tmp/folder-project', 'active', 'Project Folder')`); err != nil {
		t.Fatalf("seed folder workspaces: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO local_tasks (id, project_id, title, status, priority) VALUES
		('local-folder-task', 'folder-local', 'Local folder task', 'new', 'medium'),
		('project-folder-task', 'folder-project', 'Project folder task', 'new', 'medium'),
		('organization-folder-task', 'folder-local', 'Organization folder task', 'new', 'medium')`); err != nil {
		t.Fatalf("seed folder tasks: %v", err)
	}
	if _, err := database.Exec(`UPDATE local_tasks SET organization_id = 'org-1' WHERE id = 'organization-folder-task'`); err != nil {
		t.Fatalf("scope folder task to organization: %v", err)
	}
}

func assert021FolderMetadata(t *testing.T, database *sql.DB, taskID, projectName string) {
	t.Helper()
	var kind, name string
	if err := database.QueryRow(`SELECT project_kind, project_name FROM local_tasks WHERE id = ?`, taskID).Scan(&kind, &name); err != nil {
		t.Fatalf("read folder metadata: %v", err)
	}
	if kind != "folder" || name != projectName {
		t.Fatalf("folder metadata = (%q, %q), want (%q, %q)", kind, name, "folder", projectName)
	}
}

func assert021ProjectScopedFolderTaskIsNotClassified(t *testing.T, database *sql.DB) {
	t.Helper()
	var kind, name *string
	if err := database.QueryRow(`SELECT project_kind, project_name FROM local_tasks WHERE id = 'project-folder-task'`).Scan(&kind, &name); err != nil {
		t.Fatalf("read project-scoped folder metadata: %v", err)
	}
	if kind != nil || name != nil {
		t.Fatalf("project-scoped folder metadata = (%v, %v), want null", kind, name)
	}
}

func assert021TaskRetainedFolderMetadata(t *testing.T, store *LocalTaskStore) {
	t.Helper()
	ctx := context.Background()
	for _, operation := range []struct {
		name string
		load func() (string, string, error)
	}{
		{"get", func() (string, string, error) {
			task, err := store.Get(ctx, "local-folder-task")
			return taskProjectMetadata(task, err)
		}},
		{"list", func() (string, string, error) {
			tasks, err := store.List(ctx, localtask.TaskFilter{})
			if err != nil {
				return "", "", err
			}
			return findTaskProjectMetadata(tasks)
		}},
		{"search", func() (string, string, error) {
			results, err := store.Search(ctx, "Local folder", localtask.TaskFilter{})
			if err != nil {
				return "", "", err
			}
			tasks := make([]localtask.Task, len(results))
			for index, result := range results {
				tasks[index] = result.Task
			}
			return findTaskProjectMetadata(tasks)
		}},
	} {
		t.Run(operation.name, func(t *testing.T) {
			kind, name, err := operation.load()
			if err != nil || kind != "folder" || name != "Local Folder" {
				t.Fatalf("metadata = (%q, %q), %v; want (folder, Local Folder)", kind, name, err)
			}
		})
	}
}

func taskProjectMetadata(task localtask.Task, err error) (string, string, error) {
	if err != nil || task.ProjectKind == nil || task.ProjectName == nil {
		return "", "", err
	}
	return string(*task.ProjectKind), *task.ProjectName, nil
}

func findTaskProjectMetadata(tasks []localtask.Task) (string, string, error) {
	for _, task := range tasks {
		if task.ID == "local-folder-task" {
			return taskProjectMetadata(task, nil)
		}
	}
	return "", "", localtask.ErrTaskNotFound
}

func assert021OrganizationScopedLocalFolderTaskIsNotClassified(t *testing.T, database *sql.DB) {
	t.Helper()
	var kind, name *string
	if err := database.QueryRow(`SELECT project_kind, project_name FROM local_tasks WHERE id = 'organization-folder-task'`).Scan(&kind, &name); err != nil {
		t.Fatalf("read organization-scoped folder metadata: %v", err)
	}
	if kind != nil || name != nil {
		t.Fatalf("organization-scoped folder metadata = (%v, %v), want null", kind, name)
	}
}
