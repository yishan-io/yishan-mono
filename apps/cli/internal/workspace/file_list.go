package workspace

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

func (s *FileService) List(root string, path string, recursive bool) ([]FileEntry, error) {
	dir, err := safeJoinOptional(root, path, false)
	if err != nil {
		return nil, err
	}

	if recursive {
		if entries, ok, err := s.listGitFiles(root, path); ok || err != nil {
			if err != nil {
				return entries, err
			}
			return withContextLinkEntries(root, path, entries)
		}

		entries, err := s.walkFiles(root, dir)
		if err != nil {
			return nil, err
		}
		return withContextLinkEntries(root, path, entries)
	}

	if entries, ok := s.cachedDirectoryEntries(root, path); ok {
		return entries, nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	out := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Name() == ".git" {
			continue
		}
		fullPath := filepath.Join(dir, entry.Name())
		info, isDir, err := fileInfoForDirectoryEntry(entry, fullPath)
		if err != nil {
			return nil, err
		}
		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			return nil, err
		}
		out = append(out, FileEntry{
			Path:       filepath.ToSlash(relPath),
			Name:       entry.Name(),
			IsDir:      isDir,
			Size:       info.Size(),
			Mode:       uint32(info.Mode()),
			ModifiedAt: formatModifiedAt(info),
		})
	}

	out = markIgnoredEntries(root, path, out)
	s.storeCachedDirectoryEntries(root, path, out)
	return out, nil
}

func (s *FileService) walkFiles(root string, dir string) ([]FileEntry, error) {
	out := []FileEntry{}
	if err := filepath.WalkDir(dir, func(fullPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) {
				return nil
			}
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

		info, isDir, err := fileInfoForDirectoryEntry(entry, fullPath)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			return err
		}
		out = append(out, FileEntry{
			Path:       filepath.ToSlash(relPath),
			Name:       entry.Name(),
			IsDir:      isDir,
			Size:       info.Size(),
			Mode:       uint32(info.Mode()),
			ModifiedAt: formatModifiedAt(info),
		})

		return nil
	}); err != nil {
		return nil, err
	}

	return out, nil
}

func markIgnoredEntries(root string, listedPath string, entries []FileEntry) []FileEntry {
	if len(entries) == 0 {
		return entries
	}

	ignoredPathSet, ok := gitIgnoredPathSet(root, entries)
	ignoredDirectoryPaths := make([]string, 0, len(entries)+1)
	ignoredListedPath := filepath.ToSlash(strings.TrimSuffix(listedPath, "/"))
	listedPathIsIgnored := isGitIgnoredPath(root, listedPath)
	if listedPathIsIgnored {
		ignoredDirectoryPaths = append(ignoredDirectoryPaths, ignoredListedPath)
	}

	for index := range entries {
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(entries[index].Path, "/"))
		if entries[index].IsDir && entries[index].IsIgnored {
			ignoredDirectoryPaths = append(ignoredDirectoryPaths, normalizedPath)
			continue
		}
		if entries[index].IsDir && ok && ignoredPathSet[normalizedPath] {
			ignoredDirectoryPaths = append(ignoredDirectoryPaths, normalizedPath)
		}
	}

	for index := range entries {
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(entries[index].Path, "/"))
		entries[index].IsIgnored = entries[index].IsIgnored || (ok && ignoredPathSet[normalizedPath])
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

func isGitIgnoredPath(root string, path string) bool {
	normalizedPath := filepath.ToSlash(strings.TrimSuffix(strings.TrimSpace(path), "/"))
	if normalizedPath == "" {
		return false
	}

	cmd := exec.Command("git", "-C", root, "check-ignore", "--quiet", "--", normalizedPath)
	err := cmd.Run()
	if err == nil {
		return true
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
		return false
	}

	return false
}

func gitIgnoredPathSet(root string, entries []FileEntry) (map[string]bool, bool) {
	input := bytes.Buffer{}
	for _, entry := range entries {
		input.WriteString(entry.Path)
		input.WriteByte(0)
	}

	cmd := exec.Command("git", "-C", root, "check-ignore", "-z", "--stdin")
	cmd.Stdin = &input
	output, err := cmd.Output()
	if err != nil && len(output) == 0 {
		return nil, false
	}

	ignoredPathSet := map[string]bool{}
	for _, rawPath := range bytes.Split(output, []byte{0}) {
		path := string(rawPath)
		if path == "" {
			continue
		}
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(path, "/"))
		if normalizedPath == "" {
			continue
		}
		ignoredPathSet[normalizedPath] = true
	}

	return ignoredPathSet, true
}

func (s *FileService) listGitFiles(root string, path string) ([]FileEntry, bool, error) {
	const gitListTimeout = 8 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitListTimeout)
	defer cancel()

	args := []string{"-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--"}
	if strings.TrimSpace(path) != "" {
		args = append(args, filepath.ToSlash(path))
	}
	ignoredArgs := []string{
		"-C",
		root,
		"ls-files",
		"--others",
		"--ignored",
		"--exclude-standard",
	}
	if strings.TrimSpace(path) == "" {
		ignoredArgs = append(ignoredArgs, "--directory", "--no-empty-directory")
	}
	ignoredArgs = append(ignoredArgs, "-z", "--")
	if strings.TrimSpace(path) != "" {
		ignoredArgs = append(ignoredArgs, filepath.ToSlash(path))
	}

	var (
		normalOutput  []byte
		normalErr     error
		ignoredOutput []byte
		ignoredErr    error
	)

	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		normalOutput, normalErr = exec.CommandContext(ctx, "git", args...).Output()
	}()
	go func() {
		defer waitGroup.Done()
		ignoredOutput, ignoredErr = exec.CommandContext(ctx, "git", ignoredArgs...).Output()
	}()
	waitGroup.Wait()

	if normalErr != nil {
		return nil, false, nil
	}

	ignoredPathSet := map[string]bool{}
	if ignoredErr == nil {
		for _, rawPath := range strings.Split(string(ignoredOutput), "\x00") {
			relPath := strings.TrimSpace(rawPath)
			if relPath == "" {
				continue
			}
			normalizedRelPath := filepath.ToSlash(strings.TrimSuffix(relPath, "/"))
			if normalizedRelPath == "" {
				continue
			}
			ignoredPathSet[normalizedRelPath] = true
		}
		normalOutput = append(normalOutput, ignoredOutput...)
	}

	entryByPath := map[string]FileEntry{}
	for _, rawPath := range strings.Split(string(normalOutput), "\x00") {
		relPath := strings.TrimSpace(rawPath)
		if relPath == "" {
			continue
		}
		normalizedRelPath := filepath.ToSlash(strings.TrimSuffix(relPath, "/"))
		if normalizedRelPath == "" {
			continue
		}
		for _, directoryPath := range parentDirectoryPaths(relPath) {
			normalizedDirectoryPath := filepath.ToSlash(strings.TrimSuffix(directoryPath, "/"))
			if _, exists := entryByPath[normalizedDirectoryPath]; exists {
				continue
			}
			entry, err := fileEntryForRelativePath(root, directoryPath)
			if err != nil {
				if os.IsNotExist(err) {
					continue
				}
				return nil, true, err
			}
			if ignoredPathSet[normalizedDirectoryPath] {
				entry.IsIgnored = true
			}
			entryByPath[normalizedDirectoryPath] = entry
		}
		entry, err := fileEntryForRelativePath(root, relPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, true, err
		}
		if ignoredPathSet[normalizedRelPath] {
			entry.IsIgnored = true
		}
		entryByPath[normalizedRelPath] = entry
	}

	out := make([]FileEntry, 0, len(entryByPath))
	for _, entry := range entryByPath {
		out = append(out, entry)
	}
	sort.Slice(out, func(left, right int) bool {
		return out[left].Path < out[right].Path
	})

	return out, true, nil
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
