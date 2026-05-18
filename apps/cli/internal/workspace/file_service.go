package workspace

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"
)

type FileEntry struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	IsDir     bool   `json:"isDir"`
	IsIgnored bool   `json:"isIgnored"`
	Size      int64  `json:"size"`
	Mode      uint32 `json:"mode"`
}

type FileService struct{}

func NewFileService() *FileService {
	return &FileService{}
}

func (s *FileService) List(root string, path string, recursive bool) ([]FileEntry, error) {
	dir, err := safeJoinOptional(root, path)
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
			Path:  filepath.ToSlash(relPath),
			Name:  entry.Name(),
			IsDir: isDir,
			Size:  info.Size(),
			Mode:  uint32(info.Mode()),
		})
	}

	return markIgnoredEntries(root, out), nil
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
			Path:  filepath.ToSlash(relPath),
			Name:  entry.Name(),
			IsDir: isDir,
			Size:  info.Size(),
			Mode:  uint32(info.Mode()),
		})

		return nil
	}); err != nil {
		return nil, err
	}

	return out, nil
}

func fileInfoForDirectoryEntry(entry os.DirEntry, fullPath string) (os.FileInfo, bool, error) {
	if entry.Name() != ContextLinkName {
		info, err := entry.Info()
		if err != nil {
			return nil, false, err
		}
		return info, entry.IsDir(), nil
	}
	return contextPathFileInfo(fullPath)
}

func contextPathFileInfo(fullPath string) (os.FileInfo, bool, error) {
	info, err := os.Stat(fullPath)
	if err == nil {
		return info, info.IsDir(), nil
	}

	// Fall back to link metadata for broken symlinks or other paths Stat cannot
	// follow, so one bad context entry does not break the whole list.
	info, infoErr := os.Lstat(fullPath)
	if infoErr != nil {
		return nil, false, infoErr
	}
	return info, info.IsDir(), nil
}

func withContextLinkEntries(root string, path string, entries []FileEntry) ([]FileEntry, error) {
	contextEntries, err := listContextLinkEntries(root, path)
	if err != nil {
		return nil, err
	}
	if len(contextEntries) == 0 {
		return entries, nil
	}

	entryByPath := make(map[string]FileEntry, len(entries)+len(contextEntries))
	for _, entry := range entries {
		entryByPath[entry.Path] = entry
	}
	for _, entry := range contextEntries {
		entryByPath[entry.Path] = entry
	}

	merged := make([]FileEntry, 0, len(entryByPath))
	for _, entry := range entryByPath {
		merged = append(merged, entry)
	}
	sort.Slice(merged, func(left, right int) bool {
		return merged[left].Path < merged[right].Path
	})
	return markIgnoredEntries(root, merged), nil
}

func listContextLinkEntries(root string, path string) ([]FileEntry, error) {
	cleanPath := filepath.ToSlash(filepath.Clean(path))
	if cleanPath == "." {
		cleanPath = ""
	}
	if cleanPath != "" && cleanPath != ContextLinkName && !strings.HasPrefix(cleanPath, ContextLinkName+"/") {
		return nil, nil
	}

	linkPath := filepath.Join(root, ContextLinkName)
	contextInfo, err := os.Stat(linkPath)
	if err != nil {
		return contextLinkFallbackEntry(linkPath, cleanPath), nil
	}
	if !contextInfo.IsDir() {
		return contextLinkFallbackEntry(linkPath, cleanPath), nil
	}

	contextRoot, err := filepath.EvalSymlinks(linkPath)
	if err != nil {
		return contextLinkFallbackEntry(linkPath, cleanPath), nil
	}

	entries := []FileEntry{}
	if cleanPath == "" || cleanPath == ContextLinkName {
		entries = append(entries, FileEntry{
			Path:  ContextLinkName,
			Name:  ContextLinkName,
			IsDir: true,
			Size:  contextInfo.Size(),
			Mode:  uint32(contextInfo.Mode()),
		})
	}

	if err := filepath.WalkDir(contextRoot, func(fullPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if fullPath == contextRoot {
			return nil
		}
		if entry.Name() == ".git" {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		relTargetPath, err := filepath.Rel(contextRoot, fullPath)
		if err != nil {
			return err
		}
		contextRelPath := filepath.ToSlash(filepath.Join(ContextLinkName, relTargetPath))
		if cleanPath != "" && cleanPath != ContextLinkName && contextRelPath != cleanPath && !strings.HasPrefix(contextRelPath, cleanPath+"/") {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		entries = append(entries, FileEntry{
			Path:  contextRelPath,
			Name:  entry.Name(),
			IsDir: entry.IsDir(),
			Size:  info.Size(),
			Mode:  uint32(info.Mode()),
		})
		return nil
	}); err != nil {
		return nil, err
	}

	return entries, nil
}

func contextLinkFallbackEntry(linkPath string, cleanPath string) []FileEntry {
	if cleanPath != "" && cleanPath != ContextLinkName {
		return nil
	}
	info, err := os.Lstat(linkPath)
	if err != nil {
		return nil
	}
	return []FileEntry{{
		Path:  ContextLinkName,
		Name:  ContextLinkName,
		IsDir: false,
		Size:  info.Size(),
		Mode:  uint32(info.Mode()),
	}}
}

func markIgnoredEntries(root string, entries []FileEntry) []FileEntry {
	if len(entries) == 0 {
		return entries
	}

	ignoredPathSet, ok := gitIgnoredPathSet(root, entries)
	if !ok {
		return entries
	}

	for index := range entries {
		normalizedPath := filepath.ToSlash(strings.TrimSuffix(entries[index].Path, "/"))
		entries[index].IsIgnored = entries[index].IsIgnored || ignoredPathSet[normalizedPath]
	}
	return entries
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
		"--directory",
		"--no-empty-directory",
		"-z",
		"--",
	}
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
		Path:  filepath.ToSlash(relPath),
		Name:  filepath.Base(relPath),
		IsDir: isDir,
		Size:  info.Size(),
		Mode:  uint32(info.Mode()),
	}, nil
}

func (s *FileService) Read(root string, path string) (string, error) {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return "", err
	}

	b, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}

	return string(b), nil
}

func (s *FileService) Write(root string, path string, content string, mode uint32) (int, error) {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return 0, err
	}

	permission := os.FileMode(0o644)
	if mode != 0 {
		permission = os.FileMode(mode)
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return 0, err
	}

	if err := os.WriteFile(fullPath, []byte(content), permission); err != nil {
		return 0, err
	}

	return len(content), nil
}

func (s *FileService) Delete(root string, path string, recursive bool) error {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return err
	}

	if recursive {
		if err := os.RemoveAll(fullPath); err != nil {
			return err
		}
		return nil
	}

	if err := os.Remove(fullPath); err != nil {
		return err
	}

	return nil
}

func (s *FileService) Move(root string, fromPath string, toPath string) error {
	fromFullPath, err := safeJoin(root, fromPath)
	if err != nil {
		return err
	}
	toFullPath, err := safeJoin(root, toPath)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(toFullPath), 0o755); err != nil {
		return err
	}
	if err := os.Rename(fromFullPath, toFullPath); err != nil {
		return err
	}

	return nil
}

func (s *FileService) Mkdir(root string, path string, parents bool, mode uint32) error {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return err
	}

	permission := os.FileMode(0o755)
	if mode != 0 {
		permission = os.FileMode(mode)
	}

	if parents {
		if err := os.MkdirAll(fullPath, permission); err != nil {
			return err
		}
	} else {
		if err := os.Mkdir(fullPath, permission); err != nil {
			return err
		}
	}

	return nil
}

func (s *FileService) Stat(root string, path string) (FileEntry, error) {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return FileEntry{}, err
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return FileEntry{}, err
	}

	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return FileEntry{}, err
	}

	return FileEntry{
		Path:  filepath.ToSlash(relPath),
		Name:  filepath.Base(fullPath),
		IsDir: info.IsDir(),
		Size:  info.Size(),
		Mode:  uint32(info.Mode()),
	}, nil
}

func (s *FileService) ReadDiff(ctx context.Context, root string, path string) (GitDiffContent, error) {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return GitDiffContent{}, err
	}

	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return GitDiffContent{}, err
	}

	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("HEAD:%s", relPath))

	newBytes, readErr := os.ReadFile(fullPath)
	if readErr != nil {
		if os.IsNotExist(readErr) {
			return GitDiffContent{OldContent: oldContent, NewContent: ""}, nil
		}
		return GitDiffContent{}, readErr
	}

	return GitDiffContent{OldContent: oldContent, NewContent: string(newBytes)}, nil
}

func safeJoin(root string, p string) (string, error) {
	if p == "" {
		return "", NewRPCError(-32602, "path is required")
	}

	if containsGitMetadataPath(p) {
		return "", NewRPCError(-32003, "path points to ignored git metadata")
	}

	candidate := filepath.Join(root, p)
	full, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}

	cleanRoot := filepath.Clean(root)
	rel, err := filepath.Rel(cleanRoot, full)
	if err != nil {
		return "", err
	}

	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", NewRPCError(-32003, "path escapes workspace root")
	}

	return full, nil
}

func safeJoinOptional(root string, p string) (string, error) {
	if strings.TrimSpace(p) == "" {
		return filepath.Clean(root), nil
	}
	return safeJoin(root, p)
}

func containsGitMetadataPath(path string) bool {
	return slices.Contains(strings.Split(filepath.ToSlash(filepath.Clean(path)), "/"), ".git")
}
