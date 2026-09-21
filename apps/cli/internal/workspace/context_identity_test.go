package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

// A promoted project's worktree still links to its original UUID directory, so
// link derivation must win over the new Git repo key.
func TestResolveContextIdentity_PrefersExistingLinkTarget(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	contextKey := "01a06fd1-69bc-7407-ab05-632820f90ab4"
	contextPath := filepath.Join(home, ".yishan", "contexts", contextKey)
	if err := os.MkdirAll(contextPath, 0o755); err != nil {
		t.Fatalf("setup context dir: %v", err)
	}
	worktreePath := filepath.Join(home, "wt-primary")
	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	if err := os.Symlink(contextPath, filepath.Join(worktreePath, ContextLinkName)); err != nil {
		t.Fatalf("setup link: %v", err)
	}

	got, err := ResolveContextIdentity("owner/repo", "project-1", []string{worktreePath})
	if err != nil {
		t.Fatalf("ResolveContextIdentity: %v", err)
	}
	if got != contextKey {
		t.Fatalf("identity = %q, want the existing link target %q", got, contextKey)
	}
}

// When context was disabled before promotion the link is gone, but the old UUID
// directory may still hold personal data, so the project id wins over repoKey.
func TestResolveContextIdentity_UsesExistingProjectDirectoryWhenNoLink(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	projectID := "01a06fd1-69bc-7407-ab05-632820f90ab4"
	if err := os.MkdirAll(filepath.Join(home, ".yishan", "contexts", projectID), 0o755); err != nil {
		t.Fatalf("setup context dir: %v", err)
	}
	worktreePath := filepath.Join(home, "wt-without-link")
	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}

	got, err := ResolveContextIdentity("owner/repo", projectID, []string{worktreePath})
	if err != nil {
		t.Fatalf("ResolveContextIdentity: %v", err)
	}
	if got != projectID {
		t.Fatalf("identity = %q, want the existing project context directory %q", got, projectID)
	}
}

func TestResolveContextIdentity_FallsBackToRepoKeyThenProjectID(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	if got, err := ResolveContextIdentity("owner/repo", "project-1", nil); err != nil {
		t.Fatalf("repoKey fallback: %v", err)
	} else if got != "owner/repo" {
		t.Fatalf("identity = %q, want repoKey fallback", got)
	}

	if got, err := ResolveContextIdentity("", "project-1", nil); err != nil {
		t.Fatalf("projectId fallback: %v", err)
	} else if got != "project-1" {
		t.Fatalf("identity = %q, want projectId fallback", got)
	}

	if _, err := ResolveContextIdentity("", "", nil); err == nil {
		t.Fatal("expected an error when no identity is available")
	}
}

// A user-created symlink that does not point into the yishan context store must
// not be adopted as the project context identity.
func TestResolveContextIdentity_IgnoresForeignSymlink(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	otherTarget := filepath.Join(home, "somewhere-else")
	if err := os.MkdirAll(otherTarget, 0o755); err != nil {
		t.Fatalf("setup other target: %v", err)
	}
	worktreePath := filepath.Join(home, "wt-foreign")
	if err := os.MkdirAll(worktreePath, 0o755); err != nil {
		t.Fatalf("setup worktree: %v", err)
	}
	if err := os.Symlink(otherTarget, filepath.Join(worktreePath, ContextLinkName)); err != nil {
		t.Fatalf("setup foreign link: %v", err)
	}

	got, err := ResolveContextIdentity("owner/repo", "project-1", []string{worktreePath})
	if err != nil {
		t.Fatalf("ResolveContextIdentity: %v", err)
	}
	if got != "owner/repo" {
		t.Fatalf("identity = %q, want repoKey fallback for a foreign symlink", got)
	}
}

// Link sync must follow the existing link target rather than the current repo
// key, otherwise a promoted project would be re-pointed to a new directory.
func TestSyncContextLink_KeepsPromotedProjectContextDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	contextKey := "01a06fd1-69bc-7407-ab05-632820f90ab4"
	contextPath := filepath.Join(home, ".yishan", "contexts", contextKey)
	if err := os.MkdirAll(contextPath, 0o755); err != nil {
		t.Fatalf("setup context dir: %v", err)
	}
	primaryPath := filepath.Join(home, "wt-primary")
	featurePath := filepath.Join(home, "wt-feature")
	for _, path := range []string{primaryPath, featurePath} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("setup %s: %v", path, err)
		}
	}
	if err := os.Symlink(contextPath, filepath.Join(primaryPath, ContextLinkName)); err != nil {
		t.Fatalf("setup primary link: %v", err)
	}

	result, err := SyncContextLink(SyncContextLinkRequest{
		RepoKey:       "owner/repo",
		ProjectID:     "project-1",
		Enabled:       true,
		WorktreePaths: []string{featurePath, primaryPath},
	})
	if err != nil {
		t.Fatalf("SyncContextLink: %v", err)
	}
	if len(result.Updated) != 2 {
		t.Fatalf("expected both worktrees updated, got %+v", result)
	}

	target, err := os.Readlink(filepath.Join(featurePath, ContextLinkName))
	if err != nil {
		t.Fatalf("readlink new worktree: %v", err)
	}
	if target != contextPath {
		t.Fatalf("new worktree target = %q, want the promoted project's context dir %q", target, contextPath)
	}
}
