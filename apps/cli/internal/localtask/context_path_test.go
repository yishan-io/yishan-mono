package localtask

import (
	"os"
	"path/filepath"
	"testing"
)

func createProjectContextSymlink(worktreePath string, canonicalContextPath string) error {
	if err := os.MkdirAll(canonicalContextPath, 0o755); err != nil {
		return err
	}
	return os.Symlink(canonicalContextPath, filepath.Join(worktreePath, projectContextDirectoryName))
}

func TestResolveProjectContextPath_UsesCanonicalSymlinkTarget(t *testing.T) {
	worktreePath := t.TempDir()
	canonicalContextPath := filepath.Join(t.TempDir(), "project-context")
	if err := createProjectContextSymlink(worktreePath, canonicalContextPath); err != nil {
		t.Fatal(err)
	}
	resolvedPath, err := ResolveProjectContextPath(worktreePath, "task-1")
	if err != nil {
		t.Fatalf("resolve project context path: %v", err)
	}
	canonicalPath, err := filepath.EvalSymlinks(canonicalContextPath)
	if err != nil {
		t.Fatalf("resolve canonical context path: %v", err)
	}
	want := filepath.Join(canonicalPath, "task-context", "task-1")
	if resolvedPath != want {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, want)
	}
}

func TestResolveContextPath_RejectsUnsafeTaskID(t *testing.T) {
	if _, err := ResolveGlobalContextPath(t.TempDir(), "../task"); err != ErrInvalidTask {
		t.Fatalf("unsafe task id error = %v, want %v", err, ErrInvalidTask)
	}
}

func TestResolveGlobalContextPath(t *testing.T) {
	resolvedPath, err := ResolveGlobalContextPath("/Users/test", "task-1")
	if err != nil {
		t.Fatalf("resolve global context path: %v", err)
	}
	want := filepath.Join("/Users/test", ".yishan", "contexts", "local-tasks", "task-1")
	if resolvedPath != want {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, want)
	}
}

func TestResolveTaskContextPath_UsesMatchingAuthoritativeWorkspace(t *testing.T) {
	staleWorkspace := t.TempDir()
	matchingWorkspace := t.TempDir()
	canonicalContextPath := filepath.Join(t.TempDir(), "project-context")
	if err := createProjectContextSymlink(matchingWorkspace, canonicalContextPath); err != nil {
		t.Fatal(err)
	}
	projectID := "project-1"
	task := Task{ID: "task-1", ProjectID: &projectID}
	workspaces := []ContextWorkspace{
		{ProjectID: projectID, WorktreePath: staleWorkspace},
		{ProjectID: "other-project", WorktreePath: t.TempDir()},
		{ProjectID: projectID, WorktreePath: matchingWorkspace},
	}
	resolvedPath, err := ResolveTaskContextPath(task, workspaces)
	if err != nil {
		t.Fatal(err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(canonicalContextPath)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(canonicalRoot, "task-context", task.ID)
	if resolvedPath != want {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, want)
	}
}

func TestResolveTaskContextPath_DoesNotGuessProjectPath(t *testing.T) {
	projectID := "project-1"
	_, err := ResolveTaskContextPath(Task{ID: "task-1", ProjectID: &projectID}, nil)
	if err != ErrContextUnavailable {
		t.Fatalf("error = %v, want %v", err, ErrContextUnavailable)
	}
}
