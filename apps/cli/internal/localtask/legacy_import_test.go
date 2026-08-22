package localtask

import (
	"context"
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
func (repository *legacyImportRepository) ListWorkspaceLinks(context.Context, string) ([]WorkspaceLink, error) {
	return nil, nil
}
func (repository *legacyImportRepository) ListTaskLinks(context.Context, string) ([]WorkspaceLink, error) {
	return nil, nil
}
func (repository *legacyImportRepository) SetPrimaryWorkspaceTask(context.Context, string, string) (WorkspaceLink, error) {
	return WorkspaceLink{}, nil
}

func TestImportLegacyProjectTasks_IsIdempotentAndCopiesContext(t *testing.T) {
	root := t.TempDir()
	legacyDir := filepath.Join(root, "tasks", "active", "task-1-import")
	if err := os.MkdirAll(legacyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	state := `{"tasks":[{"id":"task-1","title":"Import task","status":"active","created":"2026-08-24","path":"tasks/active/task-1-import"}]}`
	if err := os.WriteFile(filepath.Join(root, "tasks", "state.json"), []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "plan.md"), []byte("# Plan"), 0o600); err != nil {
		t.Fatal(err)
	}
	repository := &legacyImportRepository{tasks: map[string]Task{}}
	targetRoot := t.TempDir()
	resolveTarget := func(id string) (string, error) { return filepath.Join(targetRoot, id), nil }
	for range 2 {
		if err := ImportLegacyProjectTasks(context.Background(), repository, root, "project-1", resolveTarget); err != nil {
			t.Fatalf("import legacy tasks: %v", err)
		}
	}
	if len(repository.tasks) != 1 || repository.tasks["task-1"].CreatedAt != "2026-08-24" {
		t.Fatalf("imported tasks = %#v", repository.tasks)
	}
	content, err := os.ReadFile(filepath.Join(targetRoot, "task-1", "plan.md"))
	if err != nil || string(content) != "# Plan" {
		t.Fatalf("copied plan = %q, %v", content, err)
	}
}

func TestResolveLegacyTaskPath_RejectsEscape(t *testing.T) {
	if _, err := resolveLegacyTaskPath(t.TempDir(), "../outside"); err == nil {
		t.Fatal("expected path escape to be rejected")
	}
}
