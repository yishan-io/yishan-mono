package localtask

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/workspace"
)

func TestService_ListContextRootsDerivesProjectPathThroughWorkspaceSymlink(t *testing.T) {
	service, _, repository := newTestService(t)
	projectID := "project-1"
	task := createProjectServiceTask(t, repository, projectID)
	worktree := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "project-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktree, ".my-context")); err != nil {
		t.Fatal(err)
	}
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{
		ID: "workspace-1", ProjectID: projectID, Path: worktree,
	}}}

	roots, err := service.ListContextRoots(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatal(err)
	}
	wantDirectory := filepath.Join(canonicalRoot, "task-context", task.ID)
	if len(roots) != 1 || roots[0].Directory != wantDirectory || roots[0].TaskID != task.ID ||
		roots[0].TaskTitle != task.Title || roots[0].ProjectID != projectID {
		t.Fatalf("roots = %#v", roots)
	}
}

func TestService_ListContextRootsSkipsProjectWithoutResolvableWorkspace(t *testing.T) {
	service, _, repository := newTestService(t)
	createProjectServiceTask(t, repository, "project-missing")
	service.deps.Registry = contextTestRegistry{}

	roots, err := service.ListContextRoots(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(roots) != 0 {
		t.Fatalf("roots = %#v", roots)
	}
}

func TestService_ListContextRootsUsesGlobalResolverForProjectlessTask(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Global task context")

	roots, err := service.ListContextRoots(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	wantDirectory, err := domain.ResolveDefaultGlobalContextPath(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(roots) != 1 || roots[0].Directory != wantDirectory || roots[0].ProjectID != "" {
		t.Fatalf("roots = %#v", roots)
	}
}

func TestService_ListContextRootsResolvesFolderTaskByWorkspaceID(t *testing.T) {
	service, _, repository := newTestService(t)
	folderID, folderKind, folderName := "folder-workspace-1", domain.ProjectKindFolder, "Folder context"
	task, err := repository.Create(context.Background(), domain.Task{
		ProjectID: &folderID, ProjectKind: &folderKind, ProjectName: &folderName, Title: "Folder context", Status: domain.StatusProgressing, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatal(err)
	}
	worktreePath := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "folder-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktreePath, ".my-context")); err != nil {
		t.Fatal(err)
	}
	service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{
		ID: folderID, ProjectID: "local-folder", Path: worktreePath,
	}}}

	roots, err := service.ListContextRoots(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(contextRoot)
	if err != nil {
		t.Fatal(err)
	}
	wantDirectory := filepath.Join(canonicalRoot, "task-context", task.ID)
	if len(roots) != 1 || roots[0].Directory != wantDirectory || roots[0].ProjectID != folderID {
		t.Fatalf("roots = %#v", roots)
	}
}
