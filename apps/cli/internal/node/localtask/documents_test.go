package localtask

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_DocumentsUseResolvedProjectContext(t *testing.T) {
	service, _, repository := newTestService(t)
	projectID := "project-1"
	task := createProjectServiceTask(t, repository, projectID)
	directory := attachProjectContext(t, service, projectID, task.ID)

	if _, err := service.WriteDocument(context.Background(), rpc.LocalTaskWriteDocumentParams{
		ID: task.ID, Document: "plan", Content: "# Plan\n",
	}); err != nil {
		t.Fatalf("WriteDocument: %v", err)
	}
	if _, err := service.AppendNote(context.Background(), rpc.LocalTaskAppendNoteParams{
		ID: task.ID, Content: "first note\n",
	}); err != nil {
		t.Fatalf("AppendNote: %v", err)
	}
	if _, err := service.AppendNote(context.Background(), rpc.LocalTaskAppendNoteParams{
		ID: task.ID, Content: "second note\n",
	}); err != nil {
		t.Fatalf("AppendNote second: %v", err)
	}

	assertDocumentContent(t, directory, "plan.md", "# Plan\n")
	assertDocumentContent(t, directory, "notes.md", "first note\nsecond note\n")
	readValue, err := service.ReadDocument(context.Background(), rpc.LocalTaskReadDocumentParams{
		ID: task.ID, Document: "notes",
	})
	if err != nil {
		t.Fatalf("ReadDocument: %v", err)
	}
	result := readValue.(rpc.LocalTaskDocumentResult)
	if result.Content != "first note\nsecond note\n" || result.Document != "notes" || result.ID != task.ID {
		t.Fatalf("ReadDocument result = %#v", result)
	}
}

func TestService_ReadDocumentReportsMissingDocumentAndUnknownName(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Global documents")
	isolateDocumentTestHome(t)
	_, err := service.ReadDocument(context.Background(), rpc.LocalTaskReadDocumentParams{ID: task.ID, Document: "plan"})
	if !errors.Is(err, domain.ErrDocumentNotFound) {
		t.Fatalf("ReadDocument missing error = %v", err)
	}
	_, err = service.ReadDocument(context.Background(), rpc.LocalTaskReadDocumentParams{ID: task.ID, Document: "brief"})
	if !errors.Is(err, domain.ErrInvalidDocument) {
		t.Fatalf("ReadDocument unknown document error = %v", err)
	}
}

func TestService_WriteDocumentRejectsBlankContentAndUnknownTask(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Documents")
	isolateDocumentTestHome(t)
	_, err := service.WriteDocument(context.Background(), rpc.LocalTaskWriteDocumentParams{
		ID: task.ID, Document: "notes", Content: "  ",
	})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("WriteDocument blank content error = %v", err)
	}
	_, err = service.ReadDocument(context.Background(), rpc.LocalTaskReadDocumentParams{ID: "missing", Document: "notes"})
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("ReadDocument missing task error = %v", err)
	}
}

func TestService_FinishWritesOutcomeThenMarksDone(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Finish task")
	home := t.TempDir()
	t.Setenv("HOME", home)
	finishValue, err := service.Finish(context.Background(), rpc.LocalTaskFinishParams{ID: task.ID, Outcome: "Done."})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	if finishValue.(rpc.LocalTaskFinishResult).Status != domain.StatusDone {
		t.Fatalf("Finish result = %#v", finishValue)
	}
	contextDirectory, err := domain.ResolveDefaultGlobalContextPath(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertDocumentContent(t, contextDirectory, "outcome.md", "Done.")
	repeatValue, err := service.Finish(context.Background(), rpc.LocalTaskFinishParams{ID: task.ID, Outcome: "Done."})
	if err != nil || repeatValue.(rpc.LocalTaskFinishResult).Status != domain.StatusDone {
		t.Fatalf("repeat Finish = %#v, %v", repeatValue, err)
	}
}

func TestService_FinishReportsPartialSuccessWhenStatusUpdateFails(t *testing.T) {
	_, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Partial finish")
	service := NewService(Deps{Repository: failingUpdateRepository{Repository: repository}})
	home := t.TempDir()
	t.Setenv("HOME", home)
	_, err := service.Finish(context.Background(), rpc.LocalTaskFinishParams{ID: task.ID, Outcome: "Archived."})
	var partial *FinishPartialError
	if !errors.As(err, &partial) {
		t.Fatalf("Finish error = %v, want partial success", err)
	}
	contextDirectory, resolveErr := domain.ResolveDefaultGlobalContextPath(task.ID)
	if resolveErr != nil {
		t.Fatal(resolveErr)
	}
	assertDocumentContent(t, contextDirectory, "outcome.md", "Archived.")
	reloaded, getErr := repository.Get(context.Background(), task.ID)
	if getErr != nil || reloaded.Status == domain.StatusDone {
		t.Fatalf("task status after partial finish = %v, %v", reloaded.Status, getErr)
	}

	retryService := NewService(Deps{Repository: repository})
	retryValue, retryErr := retryService.Finish(context.Background(), rpc.LocalTaskFinishParams{
		ID: task.ID, Outcome: "Archived.",
	})
	if retryErr != nil || retryValue.(rpc.LocalTaskFinishResult).Status != domain.StatusDone {
		t.Fatalf("retry Finish = %#v, %v", retryValue, retryErr)
	}
	assertDocumentContent(t, contextDirectory, "outcome.md", "Archived.")
}

func TestService_DocumentsRejectUnresolvableProjectContext(t *testing.T) {
	service, _, repository := newTestService(t)
	projectID := "project-1"
	task := createProjectServiceTask(t, repository, projectID)
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{
		ID: "matching", ProjectID: projectID, Path: t.TempDir(),
	}}}
	_, err := service.WriteDocument(context.Background(), rpc.LocalTaskWriteDocumentParams{
		ID: task.ID, Document: "notes", Content: "note",
	})
	if !errors.Is(err, domain.ErrContextUnavailable) {
		t.Fatalf("WriteDocument error = %v", err)
	}
}

func isolateDocumentTestHome(t *testing.T) string {
	t.Helper()
	homeDirectory := t.TempDir()
	t.Setenv("HOME", homeDirectory)
	t.Setenv("USERPROFILE", homeDirectory)
	return homeDirectory
}

// failingUpdateRepository fails task metadata updates to exercise finish's
// partial-success path while keeping real reads and document writes.
type failingUpdateRepository struct {
	domain.Repository
}

func (repository failingUpdateRepository) Update(context.Context, string, domain.TaskUpdate) (domain.Task, error) {
	return domain.Task{}, errors.New("database unavailable")
}

func attachProjectContext(t *testing.T, service *Service, projectID string, taskID string) string {
	t.Helper()
	worktreePath := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "canonical-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktreePath, ".my-context")); err != nil {
		t.Fatal(err)
	}
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{
		ID: "matching", ProjectID: projectID, Path: worktreePath,
	}}}
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(canonicalRoot, "task-context", taskID)
}

func assertDocumentContent(t *testing.T, directory string, basename string, expected string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(directory, basename))
	if err != nil {
		t.Fatalf("read %s: %v", basename, err)
	}
	if string(content) != expected {
		t.Fatalf("%s content = %q, want %q", basename, content, expected)
	}
}
