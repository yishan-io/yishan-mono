package watchers

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveGitDir_StandardRepo(t *testing.T) {
	root := t.TempDir()
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(root)
	if resolved != gitDir {
		t.Errorf("expected %q, got %q", gitDir, resolved)
	}
}

func TestResolveGitDir_WorktreeFile(t *testing.T) {
	root := t.TempDir()
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "HEAD"), []byte("ref: refs/heads/my-branch\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(actualGitDir, "index"), []byte("fake-index"), 0o644); err != nil {
		t.Fatal(err)
	}

	worktreeDir := filepath.Join(root, "worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitFileContent := "gitdir: " + actualGitDir + "\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(worktreeDir)
	if resolved != actualGitDir {
		t.Errorf("expected %q, got %q", actualGitDir, resolved)
	}
}

func TestResolveGitDir_WorktreeFileRelativePath(t *testing.T) {
	root := t.TempDir()
	actualGitDir := filepath.Join(root, "main-repo", ".git", "worktrees", "my-worktree")
	if err := os.MkdirAll(actualGitDir, 0o755); err != nil {
		t.Fatal(err)
	}

	worktreeDir := filepath.Join(root, "main-repo", "worktrees", "my-worktree")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	gitFileContent := "gitdir: ../../.git/worktrees/my-worktree\n"
	if err := os.WriteFile(filepath.Join(worktreeDir, ".git"), []byte(gitFileContent), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(worktreeDir)
	if resolved != actualGitDir {
		t.Errorf("expected %q, got %q", actualGitDir, resolved)
	}
}

func TestResolveGitDir_NoGitEntry(t *testing.T) {
	root := t.TempDir()
	resolved := resolveGitDir(root)
	expected := filepath.Join(root, ".git")
	if resolved != expected {
		t.Errorf("expected %q, got %q", expected, resolved)
	}
}

func TestResolveGitDir_InvalidGitFileContent(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".git"), []byte("some-random-content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved := resolveGitDir(root)
	expected := filepath.Join(root, ".git")
	if resolved != expected {
		t.Errorf("expected %q, got %q", expected, resolved)
	}
}
