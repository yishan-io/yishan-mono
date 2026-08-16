package application

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/workspace/worktree"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
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

	req := workspace.CreateRequest{
		ID:            "ws-1",
		RepoKey:       "owner/repo",
		WorkspaceName: "feature/my-branch",
		SourcePath:    srcDir,
		TargetBranch:  "feature/my-branch",
		SourceBranch:  "main",
	}

	paths, err := worktree.ResolveCreatePaths(worktree.CreateRequest{
		RepoKey:       req.RepoKey,
		WorkspaceName: req.WorkspaceName,
		SourcePath:    req.SourcePath,
		TargetBranch:  req.TargetBranch,
		SourceBranch:  req.SourceBranch,
	})
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

	if paths.WorktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.WorktreePath, want)
	}

	// The worktree path must not contain more path segments than expected —
	// i.e. "feature/my-branch" must not have been interpreted as two
	// directories.
	rel, err := filepath.Rel(filepath.Join(home, ".yishan", "worktrees", "owner", "repo"), paths.WorktreePath)
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

	req := workspace.CreateRequest{
		ID:            "ws-2",
		RepoKey:       "owner/repo",
		WorkspaceName: "my-branch",
		SourcePath:    srcDir,
		TargetBranch:  "my-branch",
		SourceBranch:  "main",
	}

	paths, err := worktree.ResolveCreatePaths(worktree.CreateRequest{
		RepoKey:       req.RepoKey,
		WorkspaceName: req.WorkspaceName,
		SourcePath:    req.SourcePath,
		TargetBranch:  req.TargetBranch,
		SourceBranch:  req.SourceBranch,
	})
	if err != nil {
		t.Fatalf("resolveCreatePaths: %v", err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}

	want := filepath.Join(home, ".yishan", "worktrees", "owner", "repo", "my-branch")
	if paths.WorktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.WorktreePath, want)
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

	req := workspace.CreateRequest{
		ID:            "ws-3",
		RepoKey:       "owner/repo",
		WorkspaceName: "a/b/c",
		SourcePath:    srcDir,
		TargetBranch:  "a/b/c",
		SourceBranch:  "main",
	}

	paths, err := worktree.ResolveCreatePaths(worktree.CreateRequest{
		RepoKey:       req.RepoKey,
		WorkspaceName: req.WorkspaceName,
		SourcePath:    req.SourcePath,
		TargetBranch:  req.TargetBranch,
		SourceBranch:  req.SourceBranch,
	})
	if err != nil {
		t.Fatalf("resolveCreatePaths: %v", err)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}

	want := filepath.Join(home, ".yishan", "worktrees", "owner", "repo", "a-b-c")
	if paths.WorktreePath != want {
		t.Errorf("worktreePath = %q, want %q", paths.WorktreePath, want)
	}
}

// TestCreateWorkspaceWithProgress_SetsStateActive verifies that a successfully
// created workspace carries State == StateActive so that the daemon
// index and in-memory map reflect the correct lifecycle state.
func TestCreateWorkspaceWithProgress_SetsStateActive(t *testing.T) {
	// Set up a bare-style source repo with one commit so CreateWorktree has a
	// ref to check out.
	srcDir := t.TempDir()
	srcDir, err := filepath.EvalSymlinks(srcDir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}
	initTestGitRepoWithCommit(t, srcDir)

	// Resolve the worktree target path so we can clean it up after the test.
	repoKey := "test/state-active"
	workspaceName := "test-state-branch"
	worktreePath, err := worktree.DefaultWorktreePath(repoKey, workspaceName)
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(worktreePath)
	})

	registry := instance.NewRegistry(files.NewFileService())
	req := workspace.CreateRequest{
		ID:             "ws-state-test",
		RepoKey:        repoKey,
		WorkspaceName:  workspaceName,
		SourcePath:     srcDir,
		TargetBranch:   workspaceName,
		SourceBranch:   "main",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
	}

	ws, err := CreateWorkspace(registry, context.Background(), req, nil)
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	if ws.State != workspace.StateActive {
		t.Errorf("Workspace.State = %q, want %q", ws.State, workspace.StateActive)
	}

	// Also confirm the runtime registry entry carries the correct state.
	stored, ok := registry.Get("ws-state-test")
	if !ok {
		t.Fatal("GetWorkspace: not found")
	}
	if stored.State != workspace.StateActive {
		t.Errorf("stored Workspace.State = %q, want %q", stored.State, workspace.StateActive)
	}
}

// initTestGitRepoWithCommit initialises a git repository at root with a single
// commit on main, making it usable as a source for git worktree add.
func initTestGitRepoWithCommit(t *testing.T, root string) {
	t.Helper()
	runGitCmd(t, root, "init", "-b", "main")
	runGitCmd(t, root, "config", "user.name", "Test")
	runGitCmd(t, root, "config", "user.email", "test@example.com")
	seedFile := filepath.Join(root, "seed.txt")
	if err := os.WriteFile(seedFile, []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runGitCmd(t, root, "add", "seed.txt")
	runGitCmd(t, root, "commit", "-m", "initial commit")
}

// runGitCmd runs a git command rooted at dir and fails the test on error.
func runGitCmd(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(out))
	}
}
