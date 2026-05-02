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

func TestRemoveContextLink_RemovesOwnedSymlink(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	if err := ensureContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("seed link: %v", err)
	}

	if err := removeContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("removeContextLink: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(worktreePath, contextLinkName)); !os.IsNotExist(err) {
		t.Fatalf("expected link removed, got err=%v", err)
	}
}

func TestRemoveContextLink_LeavesNonSymlinkAlone(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")
	userDir := filepath.Join(worktreePath, contextLinkName)

	if err := os.MkdirAll(userDir, 0o755); err != nil {
		t.Fatalf("setup user dir: %v", err)
	}
	sentinel := filepath.Join(userDir, "notes.md")
	if err := os.WriteFile(sentinel, []byte("keep me"), 0o644); err != nil {
		t.Fatalf("write sentinel: %v", err)
	}

	if err := removeContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("removeContextLink: %v", err)
	}

	if _, err := os.Stat(sentinel); err != nil {
		t.Fatalf("user data lost: %v", err)
	}
}

func TestRemoveContextLink_LeavesUnrelatedSymlinkAlone(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	otherTarget := filepath.Join(root, "elsewhere")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	if err := os.MkdirAll(otherTarget, 0o755); err != nil {
		t.Fatalf("setup other target: %v", err)
	}
	linkPath := filepath.Join(worktreePath, contextLinkName)
	if err := os.Symlink(otherTarget, linkPath); err != nil {
		t.Fatalf("setup unrelated symlink: %v", err)
	}

	if err := removeContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("removeContextLink: %v", err)
	}

	target, err := os.Readlink(linkPath)
	if err != nil {
		t.Fatalf("readlink: %v", err)
	}
	if target != otherTarget {
		t.Fatalf("unrelated symlink replaced: target=%q", target)
	}
}

func TestRemoveContextLink_NoOpWhenMissing(t *testing.T) {
	root := t.TempDir()
	contextPath := filepath.Join(root, "contexts", "repo_abc")
	worktreePath := filepath.Join(root, "worktrees", "repo_abc", "feature-x")

	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	if err := removeContextLink(contextPath, worktreePath); err != nil {
		t.Fatalf("removeContextLink missing should be no-op, got %v", err)
	}
}

func TestSyncContextLink_RequiresRepoKey(t *testing.T) {
	m := NewManager()
	if _, err := m.SyncContextLink(SyncContextLinkRequest{RepoKey: "", Enabled: true}); err == nil {
		t.Fatalf("expected error for empty repoKey")
	}
}

func TestSyncContextLink_RejectsAbsoluteRepoKey(t *testing.T) {
	m := NewManager()
	if _, err := m.SyncContextLink(SyncContextLinkRequest{RepoKey: "/etc", Enabled: true}); err == nil {
		t.Fatalf("expected error for absolute repoKey")
	}
}

// Note: SyncContextLink uses defaultContextPath which dereferences the user
// home dir. We exercise it indirectly by overriding HOME and only using
// /tmp-ish paths, validating that the call returns a result and the per-path
// outcomes line up with input shape (empty input, dedup).
func TestSyncContextLink_ResultShape(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	m := NewManager()

	res, err := m.SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "repo_abc",
		Enabled:       true,
		WorktreePaths: []string{},
	})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(res.Updated) != 0 || len(res.Errors) != 0 {
		t.Fatalf("unexpected result for empty input: %+v", res)
	}
}

func TestSyncContextLink_RejectsEmptyAndRelativePaths(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := NewManager()

	res, err := m.SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "repo_abc",
		Enabled:       true,
		WorktreePaths: []string{"", "   ", "relative/path", "./also-relative"},
	})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(res.Updated) != 0 {
		t.Fatalf("expected no updates for invalid inputs, got %+v", res)
	}
	if len(res.Skipped) != 2 {
		t.Fatalf("expected 2 skipped (empty + whitespace), got %+v", res)
	}
	for _, raw := range []string{"relative/path", "./also-relative"} {
		if msg, ok := res.Errors[raw]; !ok || msg == "" {
			t.Fatalf("expected error entry for %q, got %+v", raw, res.Errors)
		}
	}
}

func TestSyncContextLink_AcceptsTildePaths(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := NewManager()

	worktreeDir := filepath.Join(home, "wt")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	res, err := m.SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "repo_abc",
		Enabled:       true,
		WorktreePaths: []string{"~/wt"},
	})
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if len(res.Updated) != 1 {
		t.Fatalf("expected 1 updated for ~ path, got %+v", res)
	}
	if _, err := os.Lstat(filepath.Join(worktreeDir, contextLinkName)); err != nil {
		t.Fatalf("expected symlink at %s, got %v", worktreeDir, err)
	}
}

func TestSyncContextLink_AppliesEnabledThenDisabledAcrossWorktrees(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	m := NewManager()

	repoKey := "repo_abc"
	worktreeA := filepath.Join(home, "wt-a")
	worktreeB := filepath.Join(home, "wt-b")
	for _, p := range []string{worktreeA, worktreeB} {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatalf("setup %s: %v", p, err)
		}
	}

	enableRes, err := m.SyncContextLink(SyncContextLinkRequest{
		RepoKey:       repoKey,
		Enabled:       true,
		WorktreePaths: []string{worktreeA, worktreeB, worktreeA}, // includes a duplicate
	})
	if err != nil {
		t.Fatalf("enable: %v", err)
	}
	if len(enableRes.Updated) != 2 {
		t.Fatalf("expected 2 updated, got %+v", enableRes)
	}

	for _, p := range []string{worktreeA, worktreeB} {
		linkPath := filepath.Join(p, contextLinkName)
		info, err := os.Lstat(linkPath)
		if err != nil {
			t.Fatalf("expected link at %s: %v", linkPath, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Fatalf("expected symlink at %s", linkPath)
		}
	}

	disableRes, err := m.SyncContextLink(SyncContextLinkRequest{
		RepoKey:       repoKey,
		Enabled:       false,
		WorktreePaths: []string{worktreeA, worktreeB},
	})
	if err != nil {
		t.Fatalf("disable: %v", err)
	}
	if len(disableRes.Updated) != 2 {
		t.Fatalf("expected 2 updated on disable, got %+v", disableRes)
	}

	for _, p := range []string{worktreeA, worktreeB} {
		if _, err := os.Lstat(filepath.Join(p, contextLinkName)); !os.IsNotExist(err) {
			t.Fatalf("expected link removed at %s, got err=%v", p, err)
		}
	}
}
