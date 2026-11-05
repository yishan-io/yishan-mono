package files

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const recursiveListTimeout = 8 * time.Second

// List cooperatively checks cancellation between filesystem operations. It cannot
// interrupt blocked kernel I/O; ownership remains with the caller until return.
func (s *FileService) List(ctx context.Context, root string, path string, recursive bool) ([]FileEntry, error) {
	if recursive {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, recursiveListTimeout)
		defer cancel()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	dir, err := safeJoinOptional(root, path, false)
	if err != nil {
		return nil, err
	}

	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if recursive {
		return s.listRecursiveFiles(ctx, root, path, dir)
	}
	return s.listDirectory(ctx, root, path, dir)
}

func (s *FileService) listRecursiveFiles(ctx context.Context, root, path, dir string) ([]FileEntry, error) {
	entries, isGit, err := s.listGitFiles(ctx, root, path)
	if err != nil {
		return nil, err
	}
	if !isGit {
		entries, err = s.walkFiles(ctx, root, dir)
	}
	if err != nil {
		return nil, err
	}
	entries, err = s.withContextLinkEntries(ctx, root, path, entries)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func (s *FileService) listDirectory(ctx context.Context, root, path, dir string) ([]FileEntry, error) {
	// .my-context is a symlink to a shared directory outside the workspace.
	// Files copied there do not reliably produce a workspace watcher event, so
	// serving a cached listing leaves the tree stale after a drop or refresh.
	cacheable := !usesContextLinkPath(path)
	cacheGeneration := uint64(0)
	if cacheable {
		cachedEntries, isCached, generation := s.cachedDirectoryEntries(root, path)
		if isCached {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			return cachedEntries, nil
		}
		cacheGeneration = generation
	}

	out, err := readDirectoryEntries(ctx, root, dir)
	if err != nil {
		return nil, err
	}

	out, err = s.markIgnoredEntries(ctx, root, path, out)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if cacheable {
		s.storeCachedDirectoryEntries(root, path, out, cacheGeneration)
	}
	return out, nil
}

func readDirectoryEntries(ctx context.Context, root, dir string) ([]FileEntry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	out := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if entry.Name() == ".git" {
			continue
		}
		listed, err := directoryEntry(root, filepath.Join(dir, entry.Name()), entry)
		if err != nil {
			return nil, err
		}
		out = append(out, listed)
	}

	return out, ctx.Err()
}

func directoryEntry(root, fullPath string, entry os.DirEntry) (FileEntry, error) {
	info, isDir, err := fileInfoForDirectoryEntry(entry, fullPath)
	if err != nil {
		return FileEntry{}, err
	}
	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return FileEntry{}, err
	}
	return FileEntry{Path: filepath.ToSlash(relPath), Name: entry.Name(), IsDir: isDir,
		Size: info.Size(), Mode: uint32(info.Mode()), ModifiedAt: formatModifiedAt(info)}, nil
}

func (s *FileService) walkFiles(ctx context.Context, root string, dir string) ([]FileEntry, error) {
	out := []FileEntry{}
	walk := s.walkDir
	if walk == nil {
		walk = filepath.WalkDir
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	err := walk(dir, func(fullPath string, entry os.DirEntry, walkErr error) error {
		return appendWalkEntry(ctx, root, dir, fullPath, entry, walkErr, &out)
	})
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func appendWalkEntry(ctx context.Context, root, dir, fullPath string, entry os.DirEntry, walkErr error, out *[]FileEntry) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if os.IsNotExist(walkErr) {
		return nil
	}
	if walkErr != nil {
		return walkErr
	}
	if fullPath == dir {
		return nil
	}
	if entry.Name() == ".git" {
		if entry.IsDir() {
			return filepath.SkipDir
		}
		return nil
	}
	listed, err := directoryEntry(root, fullPath, entry)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	*out = append(*out, listed)
	return ctx.Err()
}

func (s *FileService) markIgnoredEntries(ctx context.Context, root string, listedPath string, entries []FileEntry) ([]FileEntry, error) {
	if len(entries) == 0 {
		return entries, ctx.Err()
	}
	markContextEntries(entries)
	ignoredPathSet, err := s.gitIgnoredPathSet(ctx, root, entries)
	if err != nil {
		return nil, err
	}
	ignoredDirectoryPaths := make([]string, 0, len(entries)+1)
	ignoredListedPath := filepath.ToSlash(strings.TrimSuffix(listedPath, "/"))
	listedPathIsIgnored, err := s.isGitIgnoredPath(ctx, root, listedPath)
	if err != nil {
		return nil, err
	}
	if listedPathIsIgnored {
		ignoredDirectoryPaths = append(ignoredDirectoryPaths, ignoredListedPath)
	}
	ignoredDirectoryPaths = collectIgnoredDirectories(ctx, entries, ignoredPathSet, ignoredDirectoryPaths)
	return applyIgnoredPaths(ctx, entries, ignoredPathSet, ignoredDirectoryPaths, ignoredListedPath, listedPathIsIgnored), ctx.Err()
}

func markContextEntries(entries []FileEntry) {
	// Git cannot evaluate child-only ignore patterns through the context symlink.
	for index := range entries {
		if usesContextLinkPath(entries[index].Path) {
			entries[index].IsIgnored = true
		}
	}
}

func collectIgnoredDirectories(ctx context.Context, entries []FileEntry, ignoredPathSet map[string]bool, ignoredDirectoryPaths []string) []string {
	for index := range entries {
		if ctx.Err() != nil {
			return ignoredDirectoryPaths
		}
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(entries[index].Path, "/"))
		if entries[index].IsDir && entries[index].IsIgnored {
			ignoredDirectoryPaths = append(ignoredDirectoryPaths, normalizedPath)
			continue
		}
		if entries[index].IsDir && ignoredPathSet[normalizedPath] {
			ignoredDirectoryPaths = append(ignoredDirectoryPaths, normalizedPath)
		}
	}

	return ignoredDirectoryPaths
}

func applyIgnoredPaths(ctx context.Context, entries []FileEntry, ignoredPathSet map[string]bool, ignoredDirectoryPaths []string, ignoredListedPath string, listedPathIsIgnored bool) []FileEntry {

	for index := range entries {
		if ctx.Err() != nil {
			return entries
		}
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(entries[index].Path, "/"))
		entries[index].IsIgnored = entries[index].IsIgnored || ignoredPathSet[normalizedPath]
		if !entries[index].IsIgnored && listedPathIsIgnored && normalizedPath == ignoredListedPath {
			entries[index].IsIgnored = true
		}
		if entries[index].IsIgnored {
			continue
		}
		entries[index].IsIgnored = hasIgnoredAncestor(normalizedPath, ignoredDirectoryPaths)
	}
	return entries
}

func hasIgnoredAncestor(path string, ignoredDirectoryPaths []string) bool {
	for _, ignoredDirectoryPath := range ignoredDirectoryPaths {
		if path != ignoredDirectoryPath && strings.HasPrefix(path, ignoredDirectoryPath+"/") {
			return true
		}
	}

	return false
}

func (s *FileService) isGitIgnoredPath(ctx context.Context, root string, path string) (bool, error) {
	normalizedPath := filepath.ToSlash(strings.TrimSuffix(path, "/"))
	if usesContextLinkPath(normalizedPath) {
		return true, ctx.Err()
	}
	if normalizedPath == "" {
		return false, ctx.Err()
	}
	repository, err := findListingRepository(ctx, root, filepath.Dir(filepath.Join(root, filepath.FromSlash(normalizedPath))))
	if err != nil {
		return false, err
	}
	relative, err := filepath.Rel(repository, filepath.Join(root, filepath.FromSlash(normalizedPath)))
	if err != nil {
		return false, err
	}
	_, isIgnored, err := s.runCheckIgnore(ctx, nil, "-C", repository, "check-ignore", "--quiet", "--", filepath.ToSlash(relative))
	return isIgnored, err
}

func (s *FileService) gitIgnoredPathSet(ctx context.Context, root string, entries []FileEntry) (map[string]bool, error) {
	groups, err := groupListingIgnorePaths(ctx, root, entries)
	if err != nil {
		return nil, err
	}
	ignored := map[string]bool{}
	for repository, input := range groups {
		output, _, err := s.runCheckIgnore(ctx, input, "-C", repository, "check-ignore", "-z", "--stdin")
		if err != nil {
			return nil, err
		}
		for path := range parseIgnoredPaths(ctx, output) {
			relative, err := filepath.Rel(root, filepath.Join(repository, filepath.FromSlash(path)))
			if err != nil {
				return nil, err
			}
			ignored[filepath.ToSlash(relative)] = true
		}
	}
	return ignored, ctx.Err()
}

func parseIgnoredPaths(ctx context.Context, output []byte) map[string]bool {
	ignoredPaths := map[string]bool{}
	for _, rawPath := range bytes.Split(output, []byte{0}) {
		if ctx.Err() != nil {
			return nil
		}
		if path := normalizeListedPath(string(rawPath)); path != "" {
			ignoredPaths[path] = true
		}
	}
	return ignoredPaths
}

func parentDirectoryPaths(path string) []string {
	parts := strings.Split(filepath.ToSlash(path), "/")
	if len(parts) <= 1 {
		return nil
	}

	directories := make([]string, 0, len(parts)-1)
	for index := 1; index < len(parts); index++ {
		directories = append(directories, strings.Join(parts[:index], "/"))
	}
	return directories
}

func fileEntryForRelativePath(root string, relPath string) (FileEntry, error) {
	fullPath := filepath.Join(root, filepath.FromSlash(relPath))
	cleanRelPath := filepath.ToSlash(filepath.Clean(relPath))
	var info os.FileInfo
	var isDir bool
	var err error
	if cleanRelPath == ContextLinkName {
		info, isDir, err = contextPathFileInfo(fullPath)
	} else {
		info, err = os.Lstat(fullPath)
		isDir = err == nil && info.IsDir()
	}
	if err != nil {
		return FileEntry{}, err
	}

	return FileEntry{
		Path:       filepath.ToSlash(relPath),
		Name:       filepath.Base(relPath),
		IsDir:      isDir,
		Size:       info.Size(),
		Mode:       uint32(info.Mode()),
		ModifiedAt: formatModifiedAt(info),
	}, nil
}
