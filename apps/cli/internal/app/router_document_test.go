package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// routerTestRegistry exposes open workspaces for Task Context path resolution.
type routerTestRegistry struct{ workspaces []workspace.Workspace }

func (registry routerTestRegistry) Get(workspaceID string) (workspace.Workspace, bool) {
	for _, localWorkspace := range registry.workspaces {
		if localWorkspace.ID == workspaceID {
			return localWorkspace, true
		}
	}
	return workspace.Workspace{}, false
}

func (registry routerTestRegistry) List() []workspace.Workspace { return registry.workspaces }

func TestBuildNamespaceRouter_WritesTaskContextDocuments(t *testing.T) {
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	workspaceStore := sqlite.NewWorkspaceStore(database)
	worktreePath := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "canonical-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktreePath, ".my-context")); err != nil {
		t.Fatal(err)
	}
	registry := routerTestRegistry{workspaces: []workspace.Workspace{{
		ID: "workspace-1", ProjectID: "project-1", Path: worktreePath,
	}}}
	localTaskService := nodelocaltask.NewService(nodelocaltask.Deps{
		Repository:     sqlite.NewLocalTaskStore(database),
		Registry:       registry,
		WorkspaceStore: sqlite.NewStore(workspaceStore),
		KeyAllocator:   routerTestKeyAllocator{},
	})
	router := buildNamespaceRouter(nil, nil, nil, nil, nil, localTaskService)
	created := createRoutedProjectTask(t, router)
	contextDirectory := resolvedContextDirectory(t, contextRoot, created.ID)

	writeRoutedDocument(t, router, rpc.MethodLocalTaskWriteDocument, `{"id":"`+created.ID+`","document":"plan","content":"# Plan\n"}`)
	writeRoutedDocument(t, router, rpc.MethodLocalTaskAppendNote, `{"id":"`+created.ID+`","content":"first note\n"}`)
	writeRoutedDocument(t, router, rpc.MethodLocalTaskAppendNote, `{"id":"`+created.ID+`","content":"second note\n"}`)

	assertRoutedDocument(t, contextDirectory, "plan.md", "# Plan\n")
	assertRoutedDocument(t, contextDirectory, "notes.md", "first note\nsecond note\n")
	readValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskReadDocument,
		json.RawMessage(`{"id":"`+created.ID+`","document":"notes"}`))
	if err != nil {
		t.Fatalf("read document: %v", err)
	}
	if readValue.(rpc.LocalTaskDocumentResult).Content != "first note\nsecond note\n" {
		t.Fatalf("read document = %#v", readValue)
	}
	finishRoutedTask(t, router, created.ID, contextDirectory)
}

func finishRoutedTask(t *testing.T, router *rpc.Router, taskID string, contextDirectory string) {
	t.Helper()
	finishValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskFinish,
		json.RawMessage(`{"id":"`+taskID+`","outcome":"Done."}`))
	if err != nil {
		t.Fatalf("finish: %v", err)
	}
	if finishValue.(rpc.LocalTaskFinishResult).Status != domain.StatusDone {
		t.Fatalf("finish result = %#v", finishValue)
	}
	assertRoutedDocument(t, contextDirectory, "outcome.md", "Done.")
	_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskReadDocument,
		json.RawMessage(`{"id":"missing","document":"notes"}`))
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("unknown task error = %v", err)
	}
	_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskReadDocument,
		json.RawMessage(`{"id":"`+taskID+`","document":"../../etc/passwd"}`))
	if !errors.Is(err, domain.ErrInvalidDocument) {
		t.Fatalf("unsafe document error = %v", err)
	}
}

func createRoutedProjectTask(t *testing.T, router *rpc.Router) domain.Task {
	t.Helper()
	createdValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskCreate,
		json.RawMessage(`{"title":"Routed documents","projectId":"project-1","organizationId":"org-1"}`))
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	created := createdValue.(domain.Task)
	if created.ProjectID == nil || *created.ProjectID != "project-1" {
		t.Fatalf("created task = %#v", created)
	}
	return created
}

func writeRoutedDocument(t *testing.T, router *rpc.Router, method string, params string) {
	t.Helper()
	if _, err := router.Call(context.Background(), &rpc.Connection{}, method, json.RawMessage(params)); err != nil {
		t.Fatalf("%s: %v", method, err)
	}
}

func resolvedContextDirectory(t *testing.T, contextRoot string, taskID string) string {
	t.Helper()
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(canonicalRoot, "task-context", taskID)
}

func assertRoutedDocument(t *testing.T, directory string, basename string, want string) {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(directory, basename))
	if err != nil {
		t.Fatalf("read %s: %v", basename, err)
	}
	if string(content) != want {
		t.Fatalf("%s = %q, want %q", basename, content, want)
	}
}
