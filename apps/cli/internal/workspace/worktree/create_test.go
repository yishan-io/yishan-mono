package worktree

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveRef(t *testing.T) {
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

	ctx := context.Background()

	// Short ref "origin/main" should resolve to "refs/remotes/origin/main".
	full := resolveRef(ctx, repo, "origin/main")
	if full != "refs/remotes/origin/main" {
		t.Fatalf("expected refs/remotes/origin/main, got %q", full)
	}

	// Empty ref and HEAD should be returned unchanged.
	if got := resolveRef(ctx, repo, ""); got != "" {
		t.Fatalf("expected empty string unchanged, got %q", got)
	}
	if got := resolveRef(ctx, repo, "HEAD"); got != "HEAD" {
		t.Fatalf("expected HEAD unchanged, got %q", got)
	}

	// Non-existent ref should be returned unchanged (graceful fallback).
	if got := resolveRef(ctx, repo, "origin/does-not-exist"); got != "origin/does-not-exist" {
		t.Fatalf("expected original ref unchanged for missing ref, got %q", got)
	}
}

// TestResolveRefWithLocalBranchCollision verifies that when both a local branch
// named "origin/main" and a remote tracking ref "refs/remotes/origin/main"
// exist, resolveRef resolves to the remote tracking ref rather than falling
// back to the ambiguous short name.
// In this state git rev-parse --verify --symbolic-full-name origin/main exits
// 0 but produces empty stdout — the old code returned "origin/main" unchanged.
func TestResolveRefWithLocalBranchCollision(t *testing.T) {
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

	// Create a local branch that shadows the remote-tracking ref name.
	runGit(t, repo, "branch", "origin/main", "HEAD")

	ctx := context.Background()
	full := resolveRef(ctx, repo, "origin/main")
	if full != "refs/remotes/origin/main" {
		t.Fatalf("expected refs/remotes/origin/main, got %q", full)
	}
}

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(out))
	}
	return strings.TrimSpace(string(out))
}
