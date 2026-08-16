package workspace

import (
	"os"

	"path/filepath"
	"testing"
)

func TestAppendExcludePattern_AppendsToNewFile(t *testing.T) {
	root := t.TempDir()
	excludePath := filepath.Join(root, "info", "exclude")

	appendExcludePattern(excludePath, ".my-context")

	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	if string(data) != ".my-context\n" {
		t.Fatalf("unexpected content: %q", string(data))
	}
}

func TestAppendExcludePattern_IsIdempotent(t *testing.T) {
	root := t.TempDir()
	excludePath := filepath.Join(root, "info", "exclude")

	appendExcludePattern(excludePath, ".my-context")
	appendExcludePattern(excludePath, ".my-context")

	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	count := 0
	for _, line := range splitLines(string(data)) {
		if line == ".my-context" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 occurrence, got %d", count)
	}
}

func TestAppendExcludePattern_AppendsToExistingFile(t *testing.T) {
	root := t.TempDir()
	infoDir := filepath.Join(root, "info")
	if err := os.MkdirAll(infoDir, 0o755); err != nil {
		t.Fatalf("mkdir info: %v", err)
	}
	excludePath := filepath.Join(infoDir, "exclude")
	if err := os.WriteFile(excludePath, []byte("*.log\n"), 0o644); err != nil {
		t.Fatalf("seed exclude: %v", err)
	}

	appendExcludePattern(excludePath, ".my-context")

	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	expected := "*.log\n.my-context\n"
	if string(data) != expected {
		t.Fatalf("unexpected content: %q want %q", string(data), expected)
	}
}

func TestAppendExcludePattern_DetectsExistingInMiddle(t *testing.T) {
	root := t.TempDir()
	infoDir := filepath.Join(root, "info")
	if err := os.MkdirAll(infoDir, 0o755); err != nil {
		t.Fatalf("mkdir info: %v", err)
	}
	excludePath := filepath.Join(infoDir, "exclude")
	if err := os.WriteFile(excludePath, []byte("*.log\n.my-context\n*.tmp\n"), 0o644); err != nil {
		t.Fatalf("seed exclude: %v", err)
	}

	appendExcludePattern(excludePath, ".my-context")

	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	if string(data) != "*.log\n.my-context\n*.tmp\n" {
		t.Fatalf("file was modified despite pattern already present: %q", string(data))
	}
}

func TestEnsureGitExclude_RegularRepo(t *testing.T) {
	root := t.TempDir()
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	EnsureGitExclude(root, ".my-context")

	excludePath := filepath.Join(gitDir, "info", "exclude")
	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	if string(data) != ".my-context\n" {
		t.Fatalf("unexpected exclude content: %q", string(data))
	}
}

func TestEnsureGitExclude_Worktree(t *testing.T) {
	root := t.TempDir()
	mainGitDir := filepath.Join(root, "main", ".git")
	worktreeGitDir := filepath.Join(mainGitDir, "worktrees", "feature-x")
	if err := os.MkdirAll(worktreeGitDir, 0o755); err != nil {
		t.Fatalf("mkdir worktree git dir: %v", err)
	}
	worktreePath := filepath.Join(root, "wt-feature-x")
	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("mkdir worktree: %v", err)
	}
	gitFile := filepath.Join(worktreePath, ".git")
	if err := os.WriteFile(gitFile, []byte("gitdir: "+worktreeGitDir), 0o644); err != nil {
		t.Fatalf("write .git file: %v", err)
	}

	EnsureGitExclude(worktreePath, ".my-context")

	excludePath := filepath.Join(mainGitDir, "info", "exclude")
	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	if string(data) != ".my-context\n" {
		t.Fatalf("unexpected exclude content: %q", string(data))
	}
}

func TestEnsureGitExclude_NoGitDir(t *testing.T) {
	root := t.TempDir()
	EnsureGitExclude(root, ".my-context")
}

func TestEnsureGitExclude_NoOpOnSecondCall(t *testing.T) {
	root := t.TempDir()
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	EnsureGitExclude(root, ".my-context")
	EnsureGitExclude(root, ".my-context")

	excludePath := filepath.Join(gitDir, "info", "exclude")
	data, err := os.ReadFile(excludePath)
	if err != nil {
		t.Fatalf("read exclude: %v", err)
	}
	count := 0
	for _, line := range splitLines(string(data)) {
		if line == ".my-context" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 occurrence, got %d", count)
	}
}
