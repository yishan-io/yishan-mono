package git

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yishan/apps/cli/internal/workspace/worktree"
)

func TestGitServiceCreateAndRemoveWorktree(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	runGit(t, root, "add", "seed.txt")
	runGit(t, root, "commit", "-m", "seed")

	worktreePath := filepath.Join(t.TempDir(), "wt-feature")
	if err := worktree.CreateWorktree(context.Background(), root, "feature/worktree", worktreePath, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	branch := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "--abbrev-ref", "HEAD"))
	if branch != "feature/worktree" {
		t.Fatalf("expected worktree branch feature/worktree, got %q", branch)
	}
	currentBranch, err := svc.CurrentBranch(context.Background(), worktreePath)
	if err != nil {
		t.Fatalf("current branch: %v", err)
	}
	if currentBranch != "feature/worktree" {
		t.Fatalf("expected current branch feature/worktree, got %q", currentBranch)
	}
	mainWorktreePath, err := worktree.MainWorktreePath(context.Background(), worktreePath)
	if err != nil {
		t.Fatalf("main worktree path: %v", err)
	}
	expectedMainWorktreePath, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve root symlink: %v", err)
	}
	actualMainWorktreePath, err := filepath.EvalSymlinks(mainWorktreePath)
	if err != nil {
		t.Fatalf("resolve main worktree symlink: %v", err)
	}
	if actualMainWorktreePath != expectedMainWorktreePath {
		t.Fatalf("expected main worktree path %q, got %q", root, mainWorktreePath)
	}

	if err := worktree.RemoveWorktree(context.Background(), root, worktreePath, true); err != nil {
		t.Fatalf("remove worktree: %v", err)
	}
	if _, err := os.Stat(worktreePath); !os.IsNotExist(err) {
		t.Fatalf("expected removed worktree path to not exist, err=%v", err)
	}
	if err := worktree.RemoveBranch(context.Background(), root, "feature/worktree", true); err != nil {
		t.Fatalf("remove worktree branch: %v", err)
	}
	if branches := strings.TrimSpace(runGit(t, root, "branch", "--list", "feature/worktree")); branches != "" {
		t.Fatalf("expected worktree branch removed, got %q", branches)
	}
}

func TestCreateWorktreeWithLocalBranchCollision(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(repo, "seed.txt"), []byte("seed\n"), 0o644)
	runGit(t, repo, "add", "seed.txt")
	runGit(t, repo, "commit", "-m", "seed")
	runGit(t, repo, "push", "origin", "HEAD:main")

	// Introduce the collision: local branch "origin/main" + remote tracking ref.
	runGit(t, repo, "branch", "origin/main", "HEAD")

	ctx := context.Background()
	worktreePath := filepath.Join(t.TempDir(), "wt-collision")
	// worktree.Create resolves the ambiguous short ref internally.
	if _, err := worktree.Create(ctx, worktree.CreateRequest{
		RepoKey: "test/repo", WorkspaceName: "feature/from-collision",
		SourcePath: repo, TargetBranch: "feature/from-collision", SourceBranch: "origin/main",
	}, worktree.CreatePaths{SourcePath: repo, WorktreePath: worktreePath, RepoKey: "test/repo"}); err != nil {
		t.Fatalf("Create with local-branch collision: %v", err)
	}

	branch := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "--abbrev-ref", "HEAD"))
	if branch != "feature/from-collision" {
		t.Fatalf("expected branch feature/from-collision, got %q", branch)
	}
}

// TestCreateWorktreeWithAmbiguousRef verifies that worktree creation succeeds
// even when the source branch ref (e.g. "origin/main") is technically ambiguous
// due to a stale packed-ref entry pointing to an older commit while the loose
// ref under refs/remotes/ points to a newer one.

func TestCreateWorktreeWithAmbiguousRef(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	// First commit — push to establish origin/main.
	os.WriteFile(filepath.Join(repo, "v1.txt"), []byte("v1\n"), 0o644)
	runGit(t, repo, "add", "v1.txt")
	runGit(t, repo, "commit", "-m", "v1")
	runGit(t, repo, "push", "origin", "HEAD:main")

	// Capture the first commit hash — this will become the stale packed-ref entry.
	staleCommit := strings.TrimSpace(runGit(t, repo, "rev-parse", "origin/main"))

	// Pack all refs so refs/remotes/origin/main lands in packed-refs.
	runGit(t, repo, "pack-refs", "--all")

	// Second commit — push again so the remote advances.
	os.WriteFile(filepath.Join(repo, "v2.txt"), []byte("v2\n"), 0o644)
	runGit(t, repo, "add", "v2.txt")
	runGit(t, repo, "commit", "-m", "v2")
	runGit(t, repo, "push", "origin", "HEAD:main")
	runGit(t, repo, "fetch", "origin")

	// Now refs/remotes/origin/main (loose) points to a newer commit than the
	// packed-ref entry — this is the ambiguous state that caused the bug.
	freshCommit := strings.TrimSpace(runGit(t, repo, "rev-parse", "origin/main"))
	if staleCommit == freshCommit {
		t.Fatal("expected loose ref to diverge from packed-ref after second push")
	}

	worktreePath := filepath.Join(t.TempDir(), "wt-from-ambiguous")
	// worktree.Create resolves the ambiguous ref internally (fast path).
	if _, err := worktree.Create(context.Background(), worktree.CreateRequest{
		RepoKey: "test/repo", WorkspaceName: "feature/from-ambiguous",
		SourcePath: repo, TargetBranch: "feature/from-ambiguous", SourceBranch: "origin/main",
	}, worktree.CreatePaths{SourcePath: repo, WorktreePath: worktreePath, RepoKey: "test/repo"}); err != nil {
		t.Fatalf("Create with ambiguous ref: %v", err)
	}

	branch := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "--abbrev-ref", "HEAD"))
	if branch != "feature/from-ambiguous" {
		t.Fatalf("expected branch feature/from-ambiguous, got %q", branch)
	}

	// The worktree should be at the fresh (non-stale) commit.
	worktreeCommit := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "HEAD"))
	if worktreeCommit != freshCommit {
		t.Fatalf("expected worktree at fresh commit %q, got %q", freshCommit, worktreeCommit)
	}
}
