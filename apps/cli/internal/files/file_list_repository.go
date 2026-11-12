package files

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// statGitMarker reports whether directory contains a Git marker (.git), which
// may be a directory (ordinary repository), a file (submodule/worktree gitdir
// pointer), or a symlink. It is injectable so tests can count repository
// discovery syscalls.
func (s *FileService) statGitMarker(directory string) (bool, error) {
	if s.gitMarkerStat != nil {
		return s.gitMarkerStat(directory)
	}
	_, err := os.Lstat(filepath.Join(directory, ".git"))
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

// findListingRepository returns the nearest directory that owns a Git marker,
// respecting nested worktrees/submodules without treating Git command failures
// as evidence that a repository boundary can be ignored.
func (s *FileService) findListingRepository(ctx context.Context, root, directory string) (string, error) {
	root = filepath.Clean(root)
	for directory != root {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		exists, err := s.statGitMarker(directory)
		if err != nil {
			return "", err
		}
		if exists {
			return directory, nil
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
		directory = parent
	}
	return root, ctx.Err()
}

// resolveCachedRepository returns the nearest directory that owns a Git marker,
// memoizing every directory it inspects so sibling lookups within one listing
// do not re-stat shared ancestors. The cache is scoped to a single listing and
// only stores successful resolutions, never errors.
func (s *FileService) resolveCachedRepository(ctx context.Context, root, directory string, cache map[string]string) (string, error) {
	root = filepath.Clean(root)
	var chain []string
	current := directory
	for {
		if repo, ok := cache[current]; ok {
			fillRepositoryCache(cache, chain, repo)
			return repo, nil
		}
		if err := ctx.Err(); err != nil {
			return "", err
		}
		exists, err := s.statGitMarker(current)
		if err != nil {
			return "", err
		}
		if exists {
			fillRepositoryCache(cache, chain, current)
			return current, nil
		}
		if current == root {
			fillRepositoryCache(cache, chain, root)
			return root, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		chain = append(chain, current)
		current = parent
	}
	fillRepositoryCache(cache, chain, root)
	return root, ctx.Err()
}

// fillRepositoryCache records that every directory in chain, and the repository
// itself, resolve to repo. This path-compresses sibling lookups.
func fillRepositoryCache(cache map[string]string, chain []string, repo string) {
	for _, dir := range chain {
		cache[dir] = repo
	}
	cache[repo] = repo
}

// groupListingIgnorePaths groups entries by the repository that owns them and
// returns each repository's NUL-separated repo-relative path input for
// `git check-ignore --stdin`.
func (s *FileService) groupListingIgnorePaths(ctx context.Context, root string, entries []FileEntry) (map[string][]byte, error) {
	groups := map[string][]byte{}
	repositories := map[string]string{}
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if usesContextLinkPath(entry.Path) {
			continue
		}
		fullPath := filepath.Join(root, filepath.FromSlash(entry.Path))
		repository, err := s.resolveCachedRepository(ctx, root, filepath.Dir(fullPath), repositories)
		if err != nil {
			return nil, err
		}
		relative, err := filepath.Rel(repository, fullPath)
		if err != nil {
			return nil, err
		}
		groups[repository] = append(groups[repository], []byte(filepath.ToSlash(relative))...)
		groups[repository] = append(groups[repository], 0)
	}
	return groups, ctx.Err()
}

func prefixRepositoryListing(ctx context.Context, root, repository string, output []byte) ([]byte, error) {
	prefix, err := filepath.Rel(root, repository)
	if err != nil {
		return nil, err
	}
	if prefix == "." {
		return output, nil
	}
	var prefixed strings.Builder
	for _, path := range strings.Split(string(output), "\x00") {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if path == "" {
			continue
		}
		prefixed.WriteString(filepath.ToSlash(filepath.Join(prefix, path)))
		prefixed.WriteByte(0)
	}
	return []byte(prefixed.String()), nil
}

func (s *FileService) resolveListingRepository(ctx context.Context, root, path string) (string, string, error) {
	if usesContextLinkPath(path) {
		return root, path, ctx.Err()
	}
	repository, err := s.findListingRepository(ctx, root, filepath.Join(root, filepath.FromSlash(path)))
	if err != nil {
		return "", "", err
	}
	relative, err := filepath.Rel(repository, filepath.Join(root, filepath.FromSlash(path)))
	if err != nil {
		return "", "", err
	}
	if relative == "." {
		relative = ""
	}
	return repository, relative, ctx.Err()
}
