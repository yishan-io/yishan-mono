package files

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// findListingRepository respects nested worktrees/submodules without treating
// Git command failures as evidence that a repository boundary can be ignored.
func findListingRepository(ctx context.Context, root, directory string) (string, error) {
	root = filepath.Clean(root)
	for directory != root {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		if _, err := os.Lstat(filepath.Join(directory, ".git")); err == nil {
			return directory, nil
		} else if !os.IsNotExist(err) {
			return "", err
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			break
		}
		directory = parent
	}
	return root, ctx.Err()
}

func groupListingIgnorePaths(ctx context.Context, root string, entries []FileEntry) (map[string][]byte, error) {
	groups := map[string][]byte{}
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if usesContextLinkPath(entry.Path) {
			continue
		}
		fullPath := filepath.Join(root, filepath.FromSlash(entry.Path))
		repository, err := findListingRepository(ctx, root, filepath.Dir(fullPath))
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

func resolveListingRepository(ctx context.Context, root, path string) (string, string, error) {
	if usesContextLinkPath(path) {
		return root, path, ctx.Err()
	}
	repository, err := findListingRepository(ctx, root, filepath.Join(root, filepath.FromSlash(path)))
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
