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

type contextTestRegistry struct{ workspaces []workspace.Workspace }

func (registry contextTestRegistry) Get(workspaceID string) (workspace.Workspace, bool) {
	for _, localWorkspace := range registry.workspaces {
		if localWorkspace.ID == workspaceID {
			return localWorkspace, true
		}
	}
	return workspace.Workspace{}, false
}

func (registry contextTestRegistry) List() []workspace.Workspace { return registry.workspaces }

func TestService_GetContextDetailsReturnsGlobalV1DocumentPaths(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Global context")
	contextValue, err := service.GetContextDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	details := contextValue.(domain.ContextDetails)
	wantDirectory, err := domain.ResolveDefaultGlobalContextPath(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertContextDetails(t, details, wantDirectory, nil)
}

func TestService_GetContextDetailsResolvesMatchingOpenProjectWorkspace(t *testing.T) {
	service, _, repository := newTestService(t)
	projectID := "project-1"
	task := createProjectServiceTask(t, repository, projectID)
	worktreePath := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "canonical-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktreePath, ".my-context")); err != nil {
		t.Fatal(err)
	}
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{
		{ID: "other", ProjectID: "project-2", Path: t.TempDir()},
		{ID: "matching", ProjectID: projectID, Path: worktreePath},
	}}
	contextValue, err := service.GetContextDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatal(err)
	}
	assertContextDetails(t, contextValue.(domain.ContextDetails), filepath.Join(canonicalRoot, "task-context", task.ID), nil)
}

func TestService_GetContextDetailsRejectsUnresolvableProjectContext(t *testing.T) {
	service, _, repository := newTestService(t)
	projectID := "project-1"
	task := createProjectServiceTask(t, repository, projectID)
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{
		ID: "matching", ProjectID: projectID, Path: t.TempDir(),
	}}}
	_, err := service.GetContextDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if !errors.Is(err, domain.ErrContextUnavailable) {
		t.Fatalf("GetContextDetails error = %v", err)
	}
}

func createProjectServiceTask(t *testing.T, repository domain.Repository, projectID string) domain.Task {
	t.Helper()
	task, err := repository.Create(context.Background(), domain.Task{
		ProjectID: &projectID, Title: "Project context", Status: domain.StatusActive, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func TestService_GetContextDetailsListsOnlyExistingDocuments(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Existing context")
	directory, err := domain.ResolveDefaultGlobalContextPath(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "plan.md"), []byte("plan"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(directory, "notes.md"), 0o755); err != nil {
		t.Fatal(err)
	}

	contextValue, err := service.GetContextDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	assertContextDetails(t, contextValue.(domain.ContextDetails), directory, []string{"plan.md"})
}

func assertContextDetails(t *testing.T, details domain.ContextDetails, directory string, wantFiles []string) {
	t.Helper()
	if details.Directory != directory {
		t.Fatalf("context directory = %q, want %q", details.Directory, directory)
	}
	if len(details.Files) != len(wantFiles) {
		t.Fatalf("context files = %#v, want %#v", details.Files, wantFiles)
	}
	for index, wantName := range wantFiles {
		file := details.Files[index]
		if file.Name != wantName || file.Path != filepath.Join(directory, wantName) {
			t.Fatalf("context file = %#v, want name %q under %q", file, wantName, directory)
		}
	}
}
