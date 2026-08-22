package localtask

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type legacyImportRepository struct{ tasks map[string]Task }

func (repository *legacyImportRepository) Create(_ context.Context, task Task) (Task, error) {
	repository.tasks[task.ID] = task
	return task, nil
}
func (repository *legacyImportRepository) Get(_ context.Context, id string) (Task, error) {
	task, found := repository.tasks[id]
	if !found {
		return Task{}, ErrTaskNotFound
	}
	return task, nil
}
func (repository *legacyImportRepository) List(context.Context, TaskFilter) ([]Task, error) {
	return nil, nil
}
func (repository *legacyImportRepository) Update(context.Context, string, TaskUpdate) (Task, error) {
	return Task{}, nil
}
func (repository *legacyImportRepository) Search(context.Context, string, TaskFilter) ([]SearchResult, error) {
	return nil, nil
}
func (repository *legacyImportRepository) LinkWorkspace(context.Context, WorkspaceLink) (WorkspaceLink, error) {
	return WorkspaceLink{}, nil
}
func (repository *legacyImportRepository) UnlinkWorkspace(context.Context, string) error { return nil }
func (repository *legacyImportRepository) UpdateWorkspaceLinkStatus(context.Context, string, Status) (WorkspaceLink, error) {
	return WorkspaceLink{}, nil
}
func (repository *legacyImportRepository) ListWorkspaceLinks(context.Context, string) ([]WorkspaceLink, error) {
	return nil, nil
}
func (repository *legacyImportRepository) ListTaskLinks(context.Context, string) ([]WorkspaceLink, error) {
	return nil, nil
}
func (repository *legacyImportRepository) SetPrimaryWorkspaceTask(context.Context, string, string) (WorkspaceLink, error) {
	return WorkspaceLink{}, nil
}

func TestImportLegacyProjectTasks_IsIdempotentAndImportsMetadata(t *testing.T) {
	root := t.TempDir()
	legacyDir := filepath.Join(root, "tasks", "active", "task-1-import")
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	state := `{"tasks":[{"id":"task-1","title":"Import task","status":"active","created":"2026-08-24","path":"tasks/active/task-1-import"}]}`
	if err := os.WriteFile(filepath.Join(root, "tasks", "state.json"), []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
	taskBrief := "# Import task\n\n## Goal\n\nImport metadata.\n\n## Acceptance Criteria\n\n- Keep IDs.\n"
	if err := os.WriteFile(filepath.Join(legacyDir, "task.md"), []byte(taskBrief), 0o600); err != nil {
		t.Fatal(err)
	}
	repository := &legacyImportRepository{tasks: map[string]Task{}}
	for range 2 {
		if err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-1"); err != nil {
			t.Fatalf("import legacy tasks: %v", err)
		}
	}
	importedTask := repository.tasks["task-1"]
	if len(repository.tasks) != 1 || importedTask.CreatedAt != "2026-08-24" {
		t.Fatalf("imported tasks = %#v", repository.tasks)
	}
	if importedTask.Description != "Import metadata.\n\nAcceptance Criteria:\n- Keep IDs." {
		t.Fatalf("imported description = %q", importedTask.Description)
	}
}

func TestResolveLegacyTaskPath_RejectsEscape(t *testing.T) {
	if _, err := resolveLegacyTaskPath(t.TempDir(), "../outside"); err == nil {
		t.Fatal("expected path escape to be rejected")
	}
}

func TestImportLegacyProjectTasks_RejectsDirectorySymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	writeLegacyStateForPath(t, root, "tasks/active/task-escape")
	if err := os.Symlink(outside, filepath.Join(root, "tasks", "active", "task-escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	repository := &legacyImportRepository{tasks: map[string]Task{}}
	if err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-1"); err == nil {
		t.Fatal("expected directory symlink escape to be rejected")
	}
}

func TestImportLegacyProjectTasks_RejectsFileSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	taskDir := filepath.Join(root, "tasks", "active", "task-escape")
	if err := os.MkdirAll(taskDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeLegacyStateForPath(t, root, "tasks/active/task-escape")
	outside := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(taskDir, "task.md")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	repository := &legacyImportRepository{tasks: map[string]Task{}}
	if err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-1"); err == nil {
		t.Fatal("expected file symlink escape to be rejected")
	}
}

func TestImportLegacyProjectTasks_RejectsOutcomeSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	taskDir := filepath.Join(root, "tasks", "completed", "task-escape")
	if err := os.MkdirAll(taskDir, 0o755); err != nil {
		t.Fatal(err)
	}
	state := `{"tasks":[{"id":"task-1","title":"Import task","status":"completed","created":"2026-08-24","path":"tasks/completed/task-escape"}]}`
	if err := os.WriteFile(filepath.Join(root, "tasks", "state.json"), []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(taskDir, "task.md"), []byte("## Goal\n\nFinish."), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outcome.md")
	if err := os.WriteFile(outside, []byte("**Completed:** 2026-08-24"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(taskDir, "outcome.md")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	repository := &legacyImportRepository{tasks: map[string]Task{}}
	if err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-1"); err == nil {
		t.Fatal("expected outcome symlink escape to be rejected")
	}
}

func TestImportLegacyProjectTasks_ReturnsTypedCrossProjectCollision(t *testing.T) {
	root := t.TempDir()
	taskDir := filepath.Join(root, "tasks", "active", "task-1")
	if err := os.MkdirAll(taskDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeLegacyStateForPath(t, root, "tasks/active/task-1")
	firstProject := "project-1"
	repository := &legacyImportRepository{tasks: map[string]Task{"task-1": {ID: "task-1", ProjectID: &firstProject}}}
	err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-2")
	var collision *LegacyTaskIDCollisionError
	if !errors.As(err, &collision) || collision.ExistingProjectID != firstProject || collision.ImportProjectID != "project-2" {
		t.Fatalf("collision error = %#v, %v", collision, err)
	}
}

func writeLegacyStateForPath(t *testing.T, root string, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, "tasks", "active"), 0o755); err != nil {
		t.Fatal(err)
	}
	state := `{"tasks":[{"id":"task-1","title":"Import task","status":"active","created":"2026-08-24","path":"` + path + `"}]}`
	if err := os.WriteFile(filepath.Join(root, "tasks", "state.json"), []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
}
