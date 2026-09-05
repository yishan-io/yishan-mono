package localtask

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
)

func TestService_TaskDocumentsUseAdmittedWorkspaceRoot(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	admitted := createTaskDocumentWorkspace(t)
	other := createTaskDocumentWorkspace(t)

	if err := service.WriteTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: admitted, Document: "plan", Content: "Admitted plan"}); err != nil {
		t.Fatal(err)
	}
	content, err := service.ReadTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: admitted, Document: "plan"})
	if err != nil || content != "Admitted plan" {
		t.Fatalf("content=%q err=%v", content, err)
	}
	otherPath := filepath.Join(other, ".my-context", "task-context", task.ID, "plan.md")
	if _, err := os.Stat(otherPath); !os.IsNotExist(err) {
		t.Fatalf("other workspace document exists: %v", err)
	}
}

func TestService_TaskDocumentReadRejectsMissingFile(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	if _, err := service.ReadTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "notes"}); err == nil {
		t.Fatal("missing task document was accepted")
	}
}

func TestService_TaskDocumentRejectsSymlinkedDirectory(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(workspaceRoot, ".my-context", "task-context")); err != nil {
		t.Fatal(err)
	}
	if err := service.WriteTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "notes", Content: "replacement"}); err == nil {
		t.Fatal("symlinked task context directory was accepted")
	}
}

func TestService_TaskDocumentRejectsSymlink(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	directory := filepath.Join(workspaceRoot, ".my-context", "task-context", task.ID)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(directory, "notes.md")); err != nil {
		t.Fatal(err)
	}
	if err := service.WriteTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "notes", Content: "replacement"}); err == nil {
		t.Fatal("symlinked task document was accepted")
	}
}

func TestService_AppendTaskNoteSerializesMutations(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	const count = 20
	var wait sync.WaitGroup
	for range count {
		wait.Go(func() {
			if err := service.AppendTaskNote(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "notes", Content: "note\n"}); err != nil {
				t.Errorf("append: %v", err)
			}
		})
	}
	wait.Wait()
	content, err := service.ReadTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "notes"})
	if err != nil || strings.Count(content, "note\n") != count {
		t.Fatalf("note count=%d err=%v", strings.Count(content, "note\n"), err)
	}
}

func TestService_FinishTaskPreservesOutcomeWhenDoneTransitionFails(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	service.deps.Repository = failingUpdateRepository{Repository: repository}

	if _, err := service.FinishTask(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "outcome", Content: "Retained outcome"}); err == nil {
		t.Fatal("failed done transition was accepted")
	}
	content, err := service.ReadTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "outcome"})
	if err != nil || content != "Retained outcome" {
		t.Fatalf("outcome=%q err=%v", content, err)
	}
}

type failingUpdateRepository struct{ domain.Repository }

func (failingUpdateRepository) Update(context.Context, string, domain.TaskUpdate) (domain.Task, error) {
	return domain.Task{}, errors.New("update failed")
}

func TestService_FinishTaskWritesOutcomeBeforeDoneAndNotifies(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createProjectTask(t, repository, "project-1")
	workspaceRoot := createTaskDocumentWorkspace(t)
	var changed atomic.Int32
	service.deps.TaskDocumentChanged = func(_ context.Context, path string, _ string, changedTask domain.Task) error {
		if filepath.Base(path) != "outcome.md" || changedTask.ID != task.ID {
			t.Fatalf("change path=%s task=%s", path, changedTask.ID)
		}
		changed.Add(1)
		return nil
	}

	finished, err := service.FinishTask(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "outcome", Content: "Done"})
	if err != nil {
		t.Fatal(err)
	}
	if finished.Status != domain.StatusDone || changed.Load() != 1 {
		t.Fatalf("finished=%#v changed=%d", finished, changed.Load())
	}
	content, err := service.ReadTaskDocument(context.Background(), TaskDocumentRequest{TaskID: task.ID, WorkspaceRoot: workspaceRoot, Document: "outcome"})
	if err != nil || content != "Done" {
		t.Fatalf("outcome=%q err=%v", content, err)
	}
}

func createProjectTask(t *testing.T, repository domain.Repository, projectID string) domain.Task {
	t.Helper()
	task, err := repository.Create(context.Background(), domain.Task{ProjectID: &projectID, Title: "Task", Status: domain.StatusProgressing, Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func createTaskDocumentWorkspace(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}
