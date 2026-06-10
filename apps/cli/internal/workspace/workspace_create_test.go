package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestResolveCreatePaths_SlashInWorkspaceName verifies that a branch name
// containing "/" (e.g. "feature/my-branch") produces a flat worktree path
// rather than a nested directory structure.
func TestResolveCreatePaths_SlashInWorkspaceName(t *testing.T) {
	// Use a real temp dir as the source path so absUserPath succeeds.
	srcDir := t.TempDir()
	// Resolve symlinks so the comparison is canonical on macOS.
	srcDir, err := filepath.EvalSymlinks(srcDir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}

	req := CreateRequest{
		ID:            "ws-1",
		RepoKey:       "owner/repo",
		WorkspaceName: "feature/my-branch",
		SourcePath:    srcDir,
		TargetBranch:  "feature/my-branch",
		SourceBranch:  "main",
	}

	paths, err := resolveCreatePaths(req)
	if err != nil {
		t.Fatalf("resolveCreatePaths: %v", err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}

	// The workspace name component must be flat (no sub-directories).
	// Expected: ~/.yishan/worktrees/owner/repo/feature-my-branch
	wantSuffix := filepath.Join(".yishan", "worktrees", "owner", "repo", "feature-my-branch")
	want := filepath.Join(home, wantSuffix)

	if paths.worktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.worktreePath, want)
	}

	// The worktree path must not contain more path segments than expected —
	// i.e. "feature/my-branch" must not have been interpreted as two
	// directories.
	rel, err := filepath.Rel(filepath.Join(home, ".yishan", "worktrees", "owner", "repo"), paths.worktreePath)
	if err != nil {
		t.Fatalf("filepath.Rel: %v", err)
	}
	if strings.Contains(rel, string(filepath.Separator)) {
		t.Errorf("worktreePath is nested: rel segment = %q, want flat name", rel)
	}
}

// TestResolveCreatePaths_SimpleName verifies that a workspace name without
// slashes is unchanged.
func TestResolveCreatePaths_SimpleName(t *testing.T) {
	srcDir := t.TempDir()
	srcDir, err := filepath.EvalSymlinks(srcDir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}

	req := CreateRequest{
		ID:            "ws-2",
		RepoKey:       "owner/repo",
		WorkspaceName: "my-branch",
		SourcePath:    srcDir,
		TargetBranch:  "my-branch",
		SourceBranch:  "main",
	}

	paths, err := resolveCreatePaths(req)
	if err != nil {
		t.Fatalf("resolveCreatePaths: %v", err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}

	want := filepath.Join(home, ".yishan", "worktrees", "owner", "repo", "my-branch")
	if paths.worktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.worktreePath, want)
	}
}

// TestResolveCreatePaths_MultipleSlashes verifies that multiple slashes in the
// workspace name are all replaced (e.g. "a/b/c" -> "a-b-c").
func TestResolveCreatePaths_MultipleSlashes(t *testing.T) {
	srcDir := t.TempDir()
	srcDir, err := filepath.EvalSymlinks(srcDir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}

	req := CreateRequest{
		ID:            "ws-3",
		RepoKey:       "owner/repo",
		WorkspaceName: "a/b/c",
		SourcePath:    srcDir,
		TargetBranch:  "a/b/c",
		SourceBranch:  "main",
	}

	paths, err := resolveCreatePaths(req)
	if err != nil {
		t.Fatalf("resolveCreatePaths: %v", err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}

	want := filepath.Join(home, ".yishan", "worktrees", "owner", "repo", "a-b-c")
	if paths.worktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.worktreePath, want)
	}
}
