package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitServiceStatusTrackUnstageRevert(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runGit(t, root, "add", "a.txt")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	status, err := svc.Status(context.Background(), root)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if len(status.Files) == 0 {
		t.Fatalf("expected changed files, got %+v", status)
	}

	if err := svc.TrackChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("track: %v", err)
	}
	if err := svc.UnstageChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("unstage: %v", err)
	}
	if err := svc.RevertChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("revert: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "a.txt")); err != nil {
		t.Fatalf("expected tracked file to exist after revert: %v", err)
	}

	if err := os.WriteFile(filepath.Join(root, "tmp.txt"), []byte("tmp\n"), 0o644); err != nil {
		t.Fatalf("write untracked file: %v", err)
	}
	if err := svc.RevertChanges(context.Background(), root, []string{"tmp.txt"}); err != nil {
		t.Fatalf("revert untracked: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "tmp.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected untracked file to be removed, err=%v", err)
	}

	status, err = svc.Status(context.Background(), root)
	if err != nil {
		t.Fatalf("status after revert: %v", err)
	}
	if len(status.Files) != 0 {
		t.Fatalf("expected clean working tree, got %+v", status)
	}
}

func TestGitServiceCommitAndQueries(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := svc.TrackChanges(context.Background(), root, []string{"note.txt"}); err != nil {
		t.Fatalf("track: %v", err)
	}
	out, err := svc.CommitChanges(context.Background(), root, "first", false, false)
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	if strings.TrimSpace(out) == "" {
		t.Fatal("expected commit output")
	}

	runGit(t, root, "branch", "base")

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v2\n"), 0o644); err != nil {
		t.Fatalf("update file: %v", err)
	}
	if err := svc.TrackChanges(context.Background(), root, []string{"note.txt"}); err != nil {
		t.Fatalf("track second: %v", err)
	}
	if _, err := svc.CommitChanges(context.Background(), root, "second", false, false); err != nil {
		t.Fatalf("second commit: %v", err)
	}

	branchStatus, err := svc.BranchStatus(context.Background(), root)
	if err != nil {
		t.Fatalf("branch status: %v", err)
	}
	if branchStatus.AheadCount < 0 {
		t.Fatalf("invalid ahead count: %+v", branchStatus)
	}

	comparison, err := svc.ListCommitsToTarget(context.Background(), root, "base")
	if err != nil {
		t.Fatalf("commits to target: %v", err)
	}
	if len(comparison.Commits) == 0 {
		t.Fatal("expected commits ahead of base")
	}
	if len(comparison.AllChangedFiles) == 0 {
		t.Fatal("expected changed files in comparison")
	}

	head := strings.TrimSpace(runGit(t, root, "rev-parse", "HEAD"))
	commitDiff, err := svc.ReadCommitDiff(context.Background(), root, head, "note.txt")
	if err != nil {
		t.Fatalf("read commit diff: %v", err)
	}
	if commitDiff.NewContent == "" {
		t.Fatalf("expected new content in commit diff: %+v", commitDiff)
	}

	branchDiff, err := svc.ReadBranchComparisonDiff(context.Background(), root, "base", "note.txt")
	if err != nil {
		t.Fatalf("read branch diff: %v", err)
	}
	if branchDiff.OldContent == "" || branchDiff.NewContent == "" {
		t.Fatalf("unexpected branch diff content: %+v", branchDiff)
	}

	branches, err := svc.ListBranches(context.Background(), root)
	if err != nil {
		t.Fatalf("list branches: %v", err)
	}
	if len(branches.Branches) == 0 {
		t.Fatal("expected at least one branch")
	}
	if branches.CurrentBranch == "" {
		t.Fatal("expected current branch")
	}

	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes: %v", err)
	}
	if len(changes.Unstaged) != 0 || len(changes.Staged) != 0 || len(changes.Untracked) != 0 {
		t.Fatalf("expected clean sections after commits, got %+v", changes)
	}

	author, err := svc.AuthorName(context.Background(), root)
	if err != nil {
		t.Fatalf("author name: %v", err)
	}
	if author != "Test User" {
		t.Fatalf("unexpected author name: %q", author)
	}

	runGit(t, root, "checkout", "-b", "feature/remove")
	runGit(t, root, "checkout", branches.CurrentBranch)
	if err := svc.RemoveBranch(context.Background(), root, "feature/remove", false); err != nil {
		t.Fatalf("remove branch: %v", err)
	}
}

func TestGitServiceValidation(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := svc.TrackChanges(context.Background(), root, nil); err == nil {
		t.Fatal("expected error for empty paths")
	}
	if _, err := svc.CommitChanges(context.Background(), root, "", false, false); err == nil {
		t.Fatal("expected error for empty commit message")
	}
}

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
	if err := svc.CreateWorktree(context.Background(), root, "feature/worktree", worktreePath, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	branch := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "--abbrev-ref", "HEAD"))
	if branch != "feature/worktree" {
		t.Fatalf("expected worktree branch feature/worktree, got %q", branch)
	}

	if err := svc.RemoveWorktree(context.Background(), root, worktreePath, true); err != nil {
		t.Fatalf("remove worktree: %v", err)
	}
	if _, err := os.Stat(worktreePath); !os.IsNotExist(err) {
		t.Fatalf("expected removed worktree path to not exist, err=%v", err)
	}
}
