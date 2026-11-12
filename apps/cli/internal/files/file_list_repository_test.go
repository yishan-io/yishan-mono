package files

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestFileServiceResolveCachedRepositoryMemoizesWalkUp(t *testing.T) {
	svc := NewFileService()
	calls := 0
	svc.gitMarkerStat = func(string) (bool, error) {
		calls++
		return false, nil
	}
	root := t.TempDir()
	cache := map[string]string{}
	directories := []string{
		filepath.Join(root, "a", "b", "c"),
		filepath.Join(root, "a", "b", "d"),
		filepath.Join(root, "a", "e"),
	}
	for _, directory := range directories {
		repo, err := svc.resolveCachedRepository(context.Background(), root, directory, cache)
		if err != nil {
			t.Fatal(err)
		}
		if repo != root {
			t.Fatalf("repo=%q, want root %q", repo, root)
		}
	}
	// Naive walk-up would stat 4+4+3 = 11 directories (c,b,a,root / d,b,a,root /
	// e,a,root). Path compression stats each unique directory exactly once: 6.
	if calls != 6 {
		t.Fatalf("repository discovery stat'd %d directories, want 6", calls)
	}
}

func TestFileServiceResolveCachedRepositoryFindsNestedMarker(t *testing.T) {
	svc := NewFileService()
	root := t.TempDir()
	repoDir := filepath.Join(root, "a", "b")
	svc.gitMarkerStat = func(dir string) (bool, error) {
		return dir == repoDir, nil
	}
	cache := map[string]string{}
	cases := []struct {
		directory string
		want      string
	}{
		{filepath.Join(repoDir, "c"), repoDir},
		{filepath.Join(repoDir, "d"), repoDir},
		{filepath.Join(root, "e"), root},
	}
	for _, scenario := range cases {
		repo, err := svc.resolveCachedRepository(context.Background(), root, scenario.directory, cache)
		if err != nil {
			t.Fatal(err)
		}
		if repo != scenario.want {
			t.Fatalf("dir=%s repo=%q, want %q", scenario.directory, repo, scenario.want)
		}
	}
}

func TestFileServiceResolveCachedRepositoryPropagatesError(t *testing.T) {
	svc := NewFileService()
	sentinel := errors.New("stat failed")
	svc.gitMarkerStat = func(string) (bool, error) { return false, sentinel }
	_, err := svc.resolveCachedRepository(context.Background(), t.TempDir(), filepath.Join(t.TempDir(), "a"), map[string]string{})
	if !errors.Is(err, sentinel) {
		t.Fatalf("err=%v, want sentinel", err)
	}
}
