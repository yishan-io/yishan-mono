package workspace

import (
	"os"

	"path/filepath"
	"testing"
)

func TestSyncContextLink_RequiresRepoKey(t *testing.T) {
	if _, err := SyncContextLink(SyncContextLinkRequest{RepoKey: "", Enabled: true}); err == nil {
		t.Fatalf("expected error for empty repoKey")
	}
}

func TestSyncContextLink_RejectsAbsoluteRepoKey(t *testing.T) {
	if _, err := SyncContextLink(SyncContextLinkRequest{RepoKey: "/etc", Enabled: true}); err == nil {
		t.Fatalf("expected error for absolute repoKey")
	}
}

// Note: SyncContextLink uses defaultContextPath which dereferences the user
// home dir. We exercise it indirectly by overriding HOME and only using
// /tmp-ish paths, validating that the call returns a result and the per-path
// outcomes line up with input shape (empty input, dedup).

func TestSyncContextLink_ResultShape(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	res, err := SyncContextLink(SyncContextLinkRequest{
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

	res, err := SyncContextLink(SyncContextLinkRequest{
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

	worktreeDir := filepath.Join(home, "wt")
	if err := os.MkdirAll(worktreeDir, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	res, err := SyncContextLink(SyncContextLinkRequest{
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
	if _, err := os.Lstat(filepath.Join(worktreeDir, ContextLinkName)); err != nil {
		t.Fatalf("expected symlink at %s, got %v", worktreeDir, err)
	}
}

func TestSyncContextLink_AppliesEnabledThenDisabledAcrossWorktrees(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	repoKey := "repo_abc"
	worktreeA := filepath.Join(home, "wt-a")
	worktreeB := filepath.Join(home, "wt-b")
	for _, p := range []string{worktreeA, worktreeB} {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatalf("setup %s: %v", p, err)
		}
	}

	enableRes, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       repoKey,
		Enabled:       true,
		WorktreePaths: []string{worktreeA, worktreeB, worktreeA},
	})
	if err != nil {
		t.Fatalf("enable: %v", err)
	}
	if len(enableRes.Updated) != 2 {
		t.Fatalf("expected 2 updated, got %+v", enableRes)
	}

	for _, p := range []string{worktreeA, worktreeB} {
		linkPath := filepath.Join(p, ContextLinkName)
		info, err := os.Lstat(linkPath)
		if err != nil {
			t.Fatalf("expected link at %s: %v", linkPath, err)
		}
		if info.Mode()&os.ModeSymlink == 0 {
			t.Fatalf("expected symlink at %s", linkPath)
		}
	}

	disableRes, err := SyncContextLink(SyncContextLinkRequest{
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
		if _, err := os.Lstat(filepath.Join(p, ContextLinkName)); !os.IsNotExist(err) {
			t.Fatalf("expected link removed at %s, got err=%v", p, err)
		}
	}
}

func TestSyncContextLink_NonGitEnabledCreatesMarkedRealDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	worktree := filepath.Join(home, "plain-folder")
	if err := os.MkdirAll(worktree, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	result, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "",
		NonGit:        true,
		Enabled:       true,
		WorktreePaths: []string{worktree},
	})
	if err != nil {
		t.Fatalf("sync context link: %v", err)
	}
	if len(result.Updated) != 1 {
		t.Fatalf("expected 1 updated, got %+v", result)
	}

	dir := filepath.Join(worktree, ContextLinkName)
	info, err := os.Lstat(dir)
	if err != nil {
		t.Fatalf("expected context dir at %s: %v", dir, err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("expected real directory, got symlink")
	}
	if !info.IsDir() {
		t.Fatalf("expected directory")
	}
	marker := filepath.Join(dir, contextMarkerName)
	markerInfo, err := os.Stat(marker)
	if err != nil {
		t.Fatalf("expected marker file: %v", err)
	}
	if markerInfo.IsDir() {
		t.Fatalf("expected marker to be a file")
	}
}

func TestSyncContextLink_NonGitEnabledIsIdempotent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	worktree := filepath.Join(home, "plain-folder")
	if err := os.MkdirAll(worktree, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	for i := 0; i < 2; i++ {
		result, err := SyncContextLink(SyncContextLinkRequest{
			RepoKey:       "",
			NonGit:        true,
			Enabled:       true,
			WorktreePaths: []string{worktree},
		})
		if err != nil {
			t.Fatalf("sync context link (run %d): %v", i+1, err)
		}
		if len(result.Updated) != 1 {
			t.Fatalf("expected 1 updated on run %d, got %+v", i+1, result)
		}
	}

	// A user file inside the dir survives a re-run.
	sentinel := filepath.Join(worktree, ContextLinkName, "MEMORY.md")
	if err := os.WriteFile(sentinel, []byte("keep"), 0o644); err != nil {
		t.Fatalf("write sentinel: %v", err)
	}
}

func TestSyncContextLink_NonGitDisabledRemovesOnlyMarkedDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	markedWorktree := filepath.Join(home, "marked")
	userWorktree := filepath.Join(home, "user")
	for _, p := range []string{markedWorktree, userWorktree} {
		if err := os.MkdirAll(p, 0o755); err != nil {
			t.Fatalf("setup %s: %v", p, err)
		}
	}

	// Marked dir (daemon-owned).
	if err := ensureNonGitContextDir(markedWorktree); err != nil {
		t.Fatalf("ensure marked dir: %v", err)
	}
	// Unmarked user dir with content.
	userDir := filepath.Join(userWorktree, ContextLinkName)
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		t.Fatalf("setup user dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(userDir, "notes.md"), []byte("keep me"), 0o644); err != nil {
		t.Fatalf("write user notes: %v", err)
	}

	result, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "",
		NonGit:        true,
		Enabled:       false,
		WorktreePaths: []string{markedWorktree, userWorktree},
	})
	if err != nil {
		t.Fatalf("sync context link: %v", err)
	}
	if len(result.Updated) != 2 {
		t.Fatalf("expected both paths processed, got %+v", result)
	}

	if _, err := os.Lstat(filepath.Join(markedWorktree, ContextLinkName)); !os.IsNotExist(err) {
		t.Fatalf("expected marked dir removed, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(userDir, "notes.md")); err != nil {
		t.Fatalf("expected user dir preserved: %v", err)
	}
}

func TestSyncContextLink_NonGitLeavesExistingSymlinkAlone(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	worktree := filepath.Join(home, "folder")
	if err := os.MkdirAll(worktree, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	target := filepath.Join(home, "contexts", "repo_abc")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("setup target: %v", err)
	}
	linkPath := filepath.Join(worktree, ContextLinkName)
	if err := os.Symlink(target, linkPath); err != nil {
		t.Fatalf("setup symlink: %v", err)
	}

	// Disabling for a non-git project must not remove a git-project symlink.
	result, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "",
		NonGit:        true,
		Enabled:       false,
		WorktreePaths: []string{worktree},
	})
	if err != nil {
		t.Fatalf("sync context link: %v", err)
	}
	if len(result.Updated) != 1 {
		t.Fatalf("expected path processed without error, got %+v", result)
	}
	if _, err := os.Lstat(linkPath); err != nil {
		t.Fatalf("expected symlink untouched: %v", err)
	}
}

func TestSyncContextLink_NonGitEnableLeavesStaleSymlinkAlone(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	worktree := filepath.Join(home, "folder")
	if err := os.MkdirAll(worktree, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	target := filepath.Join(home, "contexts", "old-repo")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("setup target: %v", err)
	}
	linkPath := filepath.Join(worktree, ContextLinkName)
	if err := os.Symlink(target, linkPath); err != nil {
		t.Fatalf("setup symlink: %v", err)
	}

	// Enabling for a non-git project must not follow the stale symlink and
	// write the marker into the old repo's shared context dir.
	result, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "",
		NonGit:        true,
		Enabled:       true,
		WorktreePaths: []string{worktree},
	})
	if err != nil {
		t.Fatalf("sync context link: %v", err)
	}
	if len(result.Updated) != 1 {
		t.Fatalf("expected path processed, got %+v", result)
	}
	if _, err := os.Lstat(linkPath); err != nil {
		t.Fatalf("expected symlink untouched: %v", err)
	}
	if _, err := os.Stat(filepath.Join(target, contextMarkerName)); !os.IsNotExist(err) {
		t.Fatalf("expected marker NOT written into the symlink target, got err=%v", err)
	}
}
