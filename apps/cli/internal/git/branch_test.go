package git

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yishan/apps/cli/internal/workspace/worktree"
)

func TestGitServiceFetchRef(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	root := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, root)
	runGit(t, root, "config", "user.name", "Test User")
	runGit(t, root, "config", "user.email", "test@example.com")

	if err := os.WriteFile(filepath.Join(root, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	runGit(t, root, "add", "seed.txt")
	runGit(t, root, "commit", "-m", "seed")
	runGit(t, root, "push", "origin", "HEAD:main")

	other := filepath.Join(t.TempDir(), "other")
	runGit(t, t.TempDir(), "clone", remote, other)
	runGit(t, other, "checkout", "-B", "main", "origin/main")
	runGit(t, other, "config", "user.name", "Test User")
	runGit(t, other, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(other, "latest.txt"), []byte("latest\n"), 0o644); err != nil {
		t.Fatalf("write latest: %v", err)
	}
	runGit(t, other, "add", "latest.txt")
	runGit(t, other, "commit", "-m", "latest")
	runGit(t, other, "push", "origin", "HEAD:main")

	before := strings.TrimSpace(runGit(t, root, "rev-parse", "origin/main"))
	latest := strings.TrimSpace(runGit(t, other, "rev-parse", "HEAD"))
	if before == latest {
		t.Fatal("expected local remote-tracking branch to be stale before fetch")
	}

	svc := NewGitService()
	if err := svc.FetchRef(context.Background(), root, "main"); err != nil {
		t.Fatalf("FetchRef: %v", err)
	}

	after := strings.TrimSpace(runGit(t, root, "rev-parse", "origin/main"))
	if after != latest {
		t.Fatalf("expected origin/main %q after fetch, got %q", latest, after)
	}
}

func TestGitServiceFetchRefNoRemote(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := svc.FetchRef(context.Background(), root, "main"); err != nil {
		t.Fatalf("expected no error for repo without remotes, got: %v", err)
	}
}

func TestGitServiceBranchDiffSummaryDivergedBranch(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(repo, "shared.txt"), []byte("v1\n"), 0o644)
	runGit(t, repo, "add", "shared.txt")
	runGit(t, repo, "commit", "-m", "shared v1")
	runGit(t, repo, "push", "origin", "HEAD:main")

	worktreePath := filepath.Join(t.TempDir(), "wt-feature")
	svc := NewGitService()
	if err := worktree.CreateWorktree(context.Background(), repo, "feature", worktreePath, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	os.WriteFile(filepath.Join(worktreePath, "feature.txt"), []byte("feature work\n"), 0o644)
	runGit(t, worktreePath, "add", "feature.txt")
	runGit(t, worktreePath, "commit", "-m", "add feature file")

	runGit(t, repo, "checkout", "main")
	os.WriteFile(filepath.Join(repo, "main-only.txt"), []byte("main work\n"), 0o644)
	runGit(t, repo, "add", "main-only.txt")
	runGit(t, repo, "commit", "-m", "add main-only file")
	runGit(t, repo, "push", "origin", "HEAD:main")

	runGit(t, worktreePath, "fetch", "origin")

	summary, err := svc.BranchDiffSummary(context.Background(), worktreePath, "origin/main")
	if err != nil {
		t.Fatalf("BranchDiffSummary: %v", err)
	}
	if summary.FileCount != 1 {
		t.Fatalf("expected 1 file in branch diff summary (feature.txt only), got %d", summary.FileCount)
	}

	comparison, err := svc.ListCommitsToTarget(context.Background(), worktreePath, "origin/main")
	if err != nil {
		t.Fatalf("ListCommitsToTarget: %v", err)
	}
	if len(comparison.Commits) != 1 {
		t.Fatalf("expected 1 commit ahead of origin/main, got %d", len(comparison.Commits))
	}
	if len(comparison.AllChangedFiles) != 1 {
		t.Fatalf("expected 1 changed file (feature.txt only), got %d: %v", len(comparison.AllChangedFiles), comparison.AllChangedFiles)
	}
	if comparison.AllChangedFiles[0].Path != "feature.txt" {
		t.Fatalf("expected changed file feature.txt, got %q", comparison.AllChangedFiles[0].Path)
	}
}

func TestGitServiceListCommitsToTargetFallsBackWhenOriginRefMissing(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(repo, "base.txt"), []byte("base\n"), 0o644)
	runGit(t, repo, "add", "base.txt")
	runGit(t, repo, "commit", "-m", "base commit")
	runGit(t, repo, "push", "origin", "HEAD:main")

	runGit(t, repo, "remote", "rename", "origin", "upstream")

	worktreePath := filepath.Join(t.TempDir(), "wt-feature")
	svc := NewGitService()
	if err := worktree.CreateWorktree(context.Background(), repo, "feature", worktreePath, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	os.WriteFile(filepath.Join(worktreePath, "feature.txt"), []byte("feature\n"), 0o644)
	runGit(t, worktreePath, "add", "feature.txt")
	runGit(t, worktreePath, "commit", "-m", "feature commit")

	comparison, err := svc.ListCommitsToTarget(context.Background(), worktreePath, "origin/main")
	if err != nil {
		t.Fatalf("ListCommitsToTarget: %v", err)
	}
	if len(comparison.Commits) != 1 {
		t.Fatalf("expected 1 commit after fallback target resolution, got %d", len(comparison.Commits))
	}
	if comparison.TargetBranch != "main" && comparison.TargetBranch != "upstream/main" {
		t.Fatalf("expected fallback target branch, got %q", comparison.TargetBranch)
	}
}

func TestGitServiceListCommitsToTargetReturnsEmptyWhenTargetMissing(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	runGit(t, root, "config", "user.name", "Test User")
	runGit(t, root, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(root, "file.txt"), []byte("content\n"), 0o644)
	runGit(t, root, "add", "file.txt")
	runGit(t, root, "commit", "-m", "initial")

	svc := NewGitService()
	comparison, err := svc.ListCommitsToTarget(context.Background(), root, "origin/main")
	if err != nil {
		t.Fatalf("expected no error when target branch is missing, got: %v", err)
	}
	if len(comparison.Commits) != 0 {
		t.Fatalf("expected no commits when target branch is missing, got %d", len(comparison.Commits))
	}
	if len(comparison.AllChangedFiles) != 0 {
		t.Fatalf("expected no changed files when target branch is missing, got %d", len(comparison.AllChangedFiles))
	}
}

// TestResolveRef verifies that resolveRef returns the full symbolic ref path
// (e.g. refs/remotes/origin/main) for a short remote tracking ref, preventing
// "ambiguous object name" errors when a loose ref and a stale packed-ref entry
// exist for the same short name.

func TestListCommitsToTargetFileStatus(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	runGit(t, root, "checkout", "-b", "base")

	// Seed base commit
	os.WriteFile(filepath.Join(root, "existing.txt"), []byte("original\n"), 0o644)
	runGit(t, root, "add", "existing.txt")
	runGit(t, root, "commit", "-m", "base")

	// Feature branch
	runGit(t, root, "checkout", "-b", "feature")

	// Added file
	os.WriteFile(filepath.Join(root, "added.txt"), []byte("new\n"), 0o644)
	runGit(t, root, "add", "added.txt")
	// Modified file
	os.WriteFile(filepath.Join(root, "existing.txt"), []byte("changed\n"), 0o644)
	runGit(t, root, "add", "existing.txt")
	runGit(t, root, "commit", "-m", "add and modify")

	// Deleted file
	os.Remove(filepath.Join(root, "existing.txt"))
	runGit(t, root, "add", "existing.txt")
	runGit(t, root, "commit", "-m", "delete existing")

	svc := NewGitService()
	comparison, err := svc.ListCommitsToTarget(context.Background(), root, "base")
	if err != nil {
		t.Fatalf("ListCommitsToTarget: %v", err)
	}

	// AllChangedFiles: cumulative diff should show added.txt (A) and existing.txt (D).
	statusByPath := make(map[string]string)
	for _, f := range comparison.AllChangedFiles {
		statusByPath[f.Path] = f.Status
	}
	if statusByPath["added.txt"] != "A" {
		t.Errorf("expected added.txt status A, got %q", statusByPath["added.txt"])
	}
	if statusByPath["existing.txt"] != "D" {
		t.Errorf("expected existing.txt status D, got %q", statusByPath["existing.txt"])
	}

	// Per-commit: first commit (most recent) deleted existing.txt.
	if len(comparison.Commits) < 1 {
		t.Fatal("expected at least 1 commit")
	}
	firstCommitStatusByPath := make(map[string]string)
	for _, f := range comparison.Commits[0].ChangedFiles {
		firstCommitStatusByPath[f.Path] = f.Status
	}
	if firstCommitStatusByPath["existing.txt"] != "D" {
		t.Errorf("first commit: expected existing.txt status D, got %q", firstCommitStatusByPath["existing.txt"])
	}
}
