package cmd

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
)

func TestImportLegacyProjectTasks_ImportsFixtureWithoutChangingMarkdown(t *testing.T) {
	contextRoot := copyLegacyTaskFixture(t)
	markdownBefore := readMarkdownFiles(t, contextRoot)
	database := openLegacyImportTestDatabase(t)
	command := &cobra.Command{}

	if err := importLegacyProjectTasks(command, database, contextRoot, "project-1"); err != nil {
		t.Fatalf("import legacy project tasks: %v", err)
	}
	assertImportedLegacyTasks(t, database)
	assertMarkdownFilesEqual(t, contextRoot, markdownBefore)
	assertCompletedImportCannotRepeat(t, command, database, contextRoot)
}

func TestImportLegacyProjectTasks_RejectsCrossProjectIDCollisionWithoutMarker(t *testing.T) {
	contextRoot := copyLegacyTaskFixture(t)
	database := openLegacyImportTestDatabase(t)
	command := &cobra.Command{}
	if err := importLegacyProjectTasks(command, database, contextRoot, "project-1"); err != nil {
		t.Fatalf("import first project: %v", err)
	}

	err := importLegacyProjectTasks(command, database, contextRoot, "project-2")
	var collision *localtask.LegacyTaskIDCollisionError
	if !errors.As(err, &collision) {
		t.Fatalf("second project import error = %v, want typed collision", err)
	}
	isComplete, markerErr := sqlite.LocalTaskLegacyImportCompleted(context.Background(), database, "project-2")
	if markerErr != nil || isComplete {
		t.Fatalf("second project marker = %t, %v, want false", isComplete, markerErr)
	}
	imported, getErr := sqlite.NewLocalTaskStore(database).Get(context.Background(), "task-7")
	if getErr != nil || imported.ProjectID == nil || *imported.ProjectID != "project-1" {
		t.Fatalf("colliding task attribution = %#v, %v", imported, getErr)
	}
}

func TestImportLegacyProjectTasks_FailedImportCanRetry(t *testing.T) {
	contextRoot := copyLegacyTaskFixture(t)
	database := openLegacyImportTestDatabase(t)
	statePath := filepath.Join(contextRoot, "tasks", "state.json")
	validState, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	invalidState := strings.Replace(string(validState), `"status": "completed"`, `"status": "invalid"`, 1)
	if err := os.WriteFile(statePath, []byte(invalidState), 0o600); err != nil {
		t.Fatal(err)
	}

	command := &cobra.Command{}
	if err := importLegacyProjectTasks(command, database, contextRoot, "project-1"); err == nil {
		t.Fatal("expected interrupted import to fail")
	}
	assertLegacyImportMarker(t, database, false)
	assertLocalTaskCount(t, database, 1)
	if err := os.WriteFile(statePath, validState, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := importLegacyProjectTasks(command, database, contextRoot, "project-1"); err != nil {
		t.Fatalf("retry legacy import: %v", err)
	}
	assertLegacyImportMarker(t, database, true)
	assertLocalTaskCount(t, database, 2)
}

func assertImportedLegacyTasks(t *testing.T, database *sql.DB) {
	t.Helper()
	store := sqlite.NewLocalTaskStore(database)
	active, err := store.Get(context.Background(), "task-7")
	if err != nil {
		t.Fatalf("get active imported task: %v", err)
	}
	wantDescription := "Validate the rebased local task system.\n\nAcceptance Criteria:\n- Keep legacy Markdown unchanged.\n- Index imported metadata with FTS."
	assertImportedActiveTask(t, active, wantDescription)
	completed, err := store.Get(context.Background(), "task-6")
	if err != nil {
		t.Fatalf("get completed imported task: %v", err)
	}
	assertImportedCompletedTask(t, completed)
	results, err := store.Search(context.Background(), "rebased", localtask.TaskFilter{})
	if err != nil || len(results) != 1 || results[0].ID != "task-7" {
		t.Fatalf("imported task search results = %#v, %v", results, err)
	}
}

func assertImportedActiveTask(t *testing.T, task localtask.Task, description string) {
	t.Helper()
	if task.ProjectID == nil || *task.ProjectID != "project-1" || task.Title != "Compatibility validation" ||
		task.Description != description || task.Status != localtask.StatusProgressing || task.Priority != localtask.PriorityMedium ||
		task.CreatedAt != "2026-08-26" || task.CompletedAt != nil {
		t.Fatalf("active imported task = %#v", task)
	}
}

func assertImportedCompletedTask(t *testing.T, task localtask.Task) {
	t.Helper()
	wantDescription := "Persist local task metadata.\n\nAcceptance Criteria:\n- Preserve the completed date."
	if task.ProjectID == nil || *task.ProjectID != "project-1" || task.Title != "Persistence foundation" ||
		task.Description != wantDescription || task.Status != localtask.StatusDone || task.Priority != localtask.PriorityMedium ||
		task.CreatedAt != "2026-08-24" || task.CompletedAt == nil || *task.CompletedAt != "2026-08-25" {
		t.Fatalf("completed imported task = %#v", task)
	}
}

func assertCompletedImportCannotRepeat(t *testing.T, command *cobra.Command, database *sql.DB, contextRoot string) {
	t.Helper()
	err := importLegacyProjectTasks(command, database, contextRoot, "project-1")
	if err == nil || !strings.Contains(err.Error(), "already imported") {
		t.Fatalf("repeat import error = %v", err)
	}
	assertLocalTaskCount(t, database, 2)
}

func openLegacyImportTestDatabase(t *testing.T) *sql.DB {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate test database: %v", err)
	}
	return database
}

func copyLegacyTaskFixture(t *testing.T) string {
	t.Helper()
	source := filepath.Join("testdata", "legacy-task-context")
	destination := filepath.Join(t.TempDir(), "legacy-task-context")
	if err := filepath.WalkDir(source, copyFixtureEntry(source, destination)); err != nil {
		t.Fatalf("copy legacy fixture: %v", err)
	}
	return destination
}

func copyFixtureEntry(source string, destination string) fs.WalkDirFunc {
	return func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, content, 0o600)
	}
}

func readMarkdownFiles(t *testing.T, root string) map[string][]byte {
	t.Helper()
	files := make(map[string][]byte)
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() || filepath.Ext(path) != ".md" {
			return walkErr
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(root, path)
		if err == nil {
			files[relativePath] = content
		}
		return err
	})
	if err != nil {
		t.Fatalf("read Markdown files: %v", err)
	}
	return files
}

func assertMarkdownFilesEqual(t *testing.T, root string, before map[string][]byte) {
	t.Helper()
	after := readMarkdownFiles(t, root)
	if len(after) != len(before) {
		t.Fatalf("Markdown file count = %d, want %d", len(after), len(before))
	}
	for path, expected := range before {
		if actual := after[path]; !bytes.Equal(actual, expected) {
			t.Fatalf("Markdown file %q changed", path)
		}
	}
}

func assertLegacyImportMarker(t *testing.T, database *sql.DB, expected bool) {
	t.Helper()
	isComplete, err := sqlite.LocalTaskLegacyImportCompleted(context.Background(), database, "project-1")
	if err != nil || isComplete != expected {
		t.Fatalf("legacy import marker = %t, %v, want %t", isComplete, err, expected)
	}
}

func assertLocalTaskCount(t *testing.T, database *sql.DB, expected int) {
	t.Helper()
	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_tasks`).Scan(&count); err != nil {
		t.Fatalf("count local tasks: %v", err)
	}
	if count != expected {
		t.Fatalf("local task count = %d, want %d", count, expected)
	}
}
