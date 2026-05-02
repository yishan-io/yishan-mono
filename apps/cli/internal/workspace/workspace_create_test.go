package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureContextLink_CreatesSymlinkAndContextDir(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("ensureContextLink: %v", err)
	}

	contextInfo, err := os.Stat(contextPath)
	if err != nil {
		t.Fatalf("context dir not created: %v", err)
	}
	if !contextInfo.IsDir() {
		t.Fatalf("context path is not a directory")
	}

	linkPath := filepath.Join(worktreePath, contextLinkName)
	linkInfo, err := os.Lstat(linkPath)
	if err != nil {
		t.Fatalf("context link not created: %v", err)
	}
	if linkInfo.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("context entry is not a symlink: mode=%s", linkInfo.Mode())
	}

	target, err := os.Readlink(linkPath)
	if err != nil {
		t.Fatalf("readlink: %v", err)
	}
	if target != contextPath {
		t.Fatalf("symlink target mismatch: got %q want %q", target, contextPath)
	}
}

func TestEnsureContextLink_IsIdempotent(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("first call: %v", err)
	}
	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("second call: %v", err)
	}

	target, err := os.Readlink(filepath.Join(worktreePath, contextLinkName))
	if err != nil {
		t.Fatalf("readlink: %v", err)
	}
	if target != contextPath {
		t.Fatalf("symlink target mismatch after re-run: got %q want %q", target, contextPath)
	}
}

func TestEnsureContextLink_ReplacesStaleSymlink(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	staleTarget := filepath.Join(root, "old-context")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	if err := os.MkdirAll(staleTarget, 0o755); err != nil {
		t.Fatalf("setup stale target: %v", err)
	}
	linkPath := filepath.Join(worktreePath, contextLinkName)
	if err := os.Symlink(staleTarget, linkPath); err != nil {
		t.Fatalf("setup stale symlink: %v", err)
	}

	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("ensureContextLink: %v", err)
	}

	target, err := os.Readlink(linkPath)
	if err != nil {
		t.Fatalf("readlink: %v", err)
	}
	if target != contextPath {
		t.Fatalf("symlink target not refreshed: got %q want %q", target, contextPath)
	}
}

func TestEnsureContextLink_PreservesExistingDirectory(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")
	existingContextDir := filepath.Join(worktreePath, contextLinkName)

	if err := os.MkdirAll(existingContextDir, 0o755); err != nil {
		t.Fatalf("setup existing dir: %v", err)
	}
	sentinel := filepath.Join(existingContextDir, "user-notes.md")
	if err := os.WriteFile(sentinel, []byte("keep me"), 0o644); err != nil {
		t.Fatalf("write sentinel: %v", err)
	}

	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("ensureContextLink: %v", err)
	}

	info, err := os.Lstat(existingContextDir)
	if err != nil {
		t.Fatalf("stat existing dir: %v", err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("existing user directory was replaced with a symlink")
	}
	if _, err := os.Stat(sentinel); err != nil {
		t.Fatalf("sentinel file lost: %v", err)
	}
}
