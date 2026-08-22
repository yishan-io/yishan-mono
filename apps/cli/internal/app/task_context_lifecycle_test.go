package app

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestBootstrap_RegistersPersistedTaskContextsAfterWorkspaceHydration(t *testing.T) {
	database := openTestDB(t)
	worktree, taskRoot := createProjectTaskContext(t, "startup-task")
	seedProjectWorkspace(t, database, worktree)
	seedProjectTask(t, database, "startup-task")
	app := bootstrapTaskContextApp(t, database)

	planPath := filepath.Join(taskRoot, "plan.md")
	assertIncrementalTaskContextAttribution(t, app.memory, planPath, worktree, "startup-task")
	if err := os.Remove(filepath.Join(worktree, ".my-context", "task-context", "startup-task", "plan.md")); err != nil {
		t.Fatal(err)
	}
	app.forwardMemoryFileChanges(worktree, []string{filepath.Join(".my-context", "task-context", "startup-task", "plan.md")})
	results, err := app.memory.Search(context.Background(), "lifecycle registration phrase", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("deleted Task Context result remained indexed: %#v", results)
	}
}

func TestLocalTaskCreate_RegistersNewTaskContext(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	database := openTestDB(t)
	app := bootstrapTaskContextApp(t, database)

	createdValue, err := app.localTaskSvc.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Created task"})
	if err != nil {
		t.Fatalf("create Local Task: %v", err)
	}
	created := createdValue.(localtask.Task)
	taskRoot, err := localtask.ResolveDefaultGlobalContextPath(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	planPath := writeTaskPlan(t, taskRoot)
	assertIncrementalTaskContextAttribution(t, app.memory, planPath, "", created.ID)
}

func TestWorkspaceOpen_RegistersProjectTaskThatBecomesResolvable(t *testing.T) {
	database := openTestDB(t)
	seedProjectTask(t, database, "waiting-task")
	app := bootstrapTaskContextApp(t, database)
	worktree, taskRoot := createProjectTaskContext(t, "waiting-task")
	planPath := filepath.Join(taskRoot, "plan.md")
	if app.memory.ShouldIndex(planPath) {
		t.Fatal("project task context registered before a workspace made it resolvable")
	}

	if _, err := app.workspaceSvc.Open(workspace.OpenRequest{
		ID: "workspace-later", Path: worktree, ProjectID: "project-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	assertIncrementalTaskContextAttribution(t, app.memory, planPath, worktree, "waiting-task")
}

func TestWorkspaceCreate_RegistersProjectTaskThroughCreateLifecycle(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	database := openTestDB(t)
	seedProjectTask(t, database, "created-workspace-task")
	app := bootstrapTaskContextApp(t, database)

	repoKey := "review/create-refresh"
	contextRoot, err := workspace.DefaultContextPath(repoKey)
	if err != nil {
		t.Fatal(err)
	}
	taskRoot := filepath.Join(contextRoot, "task-context", "created-workspace-task")
	planPath := writeTaskPlan(t, taskRoot)
	sourcePath := t.TempDir()
	initTaskContextGitRepository(t, sourcePath)
	if _, err := app.workspaceSvc.Create(context.Background(), rpc.WorkspaceCreateParams{
		ID: "workspace-created", ProjectID: "project-1", RepoKey: repoKey,
		WorkspaceName: "review-create-refresh", SourcePath: sourcePath,
		TargetBranch: "review-create-refresh", SourceBranch: "main", ContextEnabled: true,
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if err := app.memory.OnFileChanged(planPath, "", "project-1"); err != nil {
			t.Fatalf("incremental index: %v", err)
		}
		results, searchErr := app.memory.Search(context.Background(), "lifecycle registration phrase", "", "", 10)
		if searchErr != nil {
			t.Fatalf("search: %v", searchErr)
		}
		for _, result := range results {
			if result.Source == memory.SourceTaskContext && result.TaskID == "created-workspace-task" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("Task Context was not registered after workspace create finalization; workspaces = %#v", app.registry.List())
}

func TestLocalTaskUpdate_RefreshesIndexedAndIncrementalTaskTitles(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	database := openTestDB(t)
	app := bootstrapTaskContextApp(t, database)

	createdValue, err := app.localTaskSvc.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Old title"})
	if err != nil {
		t.Fatalf("create Local Task: %v", err)
	}
	created := createdValue.(localtask.Task)
	taskRoot, err := localtask.ResolveDefaultGlobalContextPath(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	planPath := writeTaskPlan(t, taskRoot)
	if err := app.memory.OnFileChanged(planPath, "", ""); err != nil {
		t.Fatalf("index existing Task Context: %v", err)
	}

	newTitle := "New title"
	if _, err := app.localTaskSvc.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, Title: &newTitle}); err != nil {
		t.Fatalf("update Local Task: %v", err)
	}
	assertTaskContextSearchTitle(t, app.memory, "lifecycle registration phrase", newTitle)

	if err := os.WriteFile(planPath, []byte("incremental renamed title phrase"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.memory.OnFileChanged(planPath, "", ""); err != nil {
		t.Fatalf("incremental Task Context update: %v", err)
	}
	assertTaskContextSearchTitle(t, app.memory, "incremental renamed", newTitle)
}

func initTaskContextGitRepository(t *testing.T, root string) {
	t.Helper()
	commands := [][]string{
		{"init", "-b", "main"}, {"config", "user.name", "Test"}, {"config", "user.email", "test@example.com"},
		{"add", "seed.txt"}, {"commit", "-m", "initial"},
	}
	if err := os.WriteFile(filepath.Join(root, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, args := range commands {
		command := exec.Command("git", append([]string{"-C", root}, args...)...)
		if output, err := command.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, output)
		}
	}
}

func assertTaskContextSearchTitle(t *testing.T, service *memory.Service, query string, wantTitle string) {
	t.Helper()
	results, err := service.Search(context.Background(), query, "", "", 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 || results[0].TaskTitle != wantTitle {
		t.Fatalf("search results = %#v, want Task title %q", results, wantTitle)
	}
}

func bootstrapTaskContextApp(t *testing.T, database *sql.DB) *App {
	t.Helper()
	app, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(),
		TokenUsage: newRecordingTokenUsage(database),
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	t.Cleanup(func() { _ = app.Close() })
	return app
}

func createProjectTaskContext(t *testing.T, taskID string) (string, string) {
	t.Helper()
	contextRoot := t.TempDir()
	taskRoot := filepath.Join(contextRoot, "task-context", taskID)
	writeTaskPlan(t, taskRoot)
	worktree := t.TempDir()
	if err := os.MkdirAll(filepath.Join(worktree, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktree, ".my-context")); err != nil {
		t.Fatal(err)
	}
	return worktree, taskRoot
}

func writeTaskPlan(t *testing.T, taskRoot string) string {
	t.Helper()
	if err := os.MkdirAll(taskRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	planPath := filepath.Join(taskRoot, "plan.md")
	if err := os.WriteFile(planPath, []byte("lifecycle registration phrase"), 0o644); err != nil {
		t.Fatal(err)
	}
	return planPath
}

func seedProjectTask(t *testing.T, database *sql.DB, taskID string) {
	t.Helper()
	projectID := "project-1"
	_, err := sqlite.NewLocalTaskStore(database).Create(context.Background(), localtask.Task{
		ID: taskID, ProjectID: &projectID, Title: "Project task", Status: localtask.StatusActive, Priority: localtask.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("seed Local Task: %v", err)
	}
}

func seedProjectWorkspace(t *testing.T, database *sql.DB, worktree string) {
	t.Helper()
	err := sqlite.NewWorkspaceStore(database).Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-startup", ProjectID: "project-1", NodeID: "node-1", Kind: "worktree",
		Status: "active", LocalPath: worktree, State: "active",
	})
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
}

func assertIncrementalTaskContextAttribution(t *testing.T, service *memory.Service, planPath string, worktree string, taskID string) {
	t.Helper()
	if err := service.OnFileChanged(planPath, worktree, "project-1"); err != nil {
		t.Fatalf("incremental index: %v", err)
	}
	results, err := service.Search(context.Background(), "lifecycle registration phrase", "", "", 10)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 || results[0].Source != memory.SourceTaskContext || results[0].TaskID != taskID {
		t.Fatalf("incremental result = %#v, want attributed task %q", results, taskID)
	}
}
