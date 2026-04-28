package workspace

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
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
			return entries, err
		}

		return s.walkFiles(root, dir)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	out := make([]FileEntry, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		fullPath := filepath.Join(dir, entry.Name())
		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			return nil, err
		}
		out = append(out, FileEntry{
			Path:  filepath.ToSlash(relPath),
			Name:  entry.Name(),
			IsDir: entry.IsDir(),
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
			return walkErr
		}
		if fullPath == dir {
			return nil
		}
		if entry.IsDir() && entry.Name() == ".git" {
			return filepath.SkipDir
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			return err
		}
		out = append(out, FileEntry{
			Path:  filepath.ToSlash(relPath),
			Name:  entry.Name(),
			IsDir: entry.IsDir(),
			Size:  info.Size(),
			Mode:  uint32(info.Mode()),
		})

		return nil
	}); err != nil {
		return nil, err
	}

	return out, nil
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
		entries[index].IsIgnored = ignoredPathSet[entries[index].Path]
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
		ignoredPathSet[filepath.ToSlash(path)] = true
	}

	return ignoredPathSet, true
}

func (s *FileService) listGitFiles(root string, path string) ([]FileEntry, bool, error) {
	args := []string{"-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--"}
	if strings.TrimSpace(path) != "" {
		args = append(args, filepath.ToSlash(path))
	}
	cmd := exec.Command("git", args...)
	output, err := cmd.Output()
	if err != nil {
		return nil, false, nil
	}

	entryByPath := map[string]FileEntry{}
	for _, rawPath := range strings.Split(string(output), "\x00") {
		relPath := strings.TrimSpace(rawPath)
		if relPath == "" {
			continue
		}
		for _, directoryPath := range parentDirectoryPaths(relPath) {
			if _, exists := entryByPath[directoryPath]; exists {
				continue
			}
			entry, err := fileEntryForRelativePath(root, directoryPath)
			if err != nil {
				return nil, true, err
			}
			entryByPath[directoryPath] = entry
		}
		entry, err := fileEntryForRelativePath(root, relPath)
		if err != nil {
			return nil, true, err
		}
		entryByPath[relPath] = entry
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
	info, err := os.Stat(fullPath)
	if err != nil {
		return FileEntry{}, err
	}

	return FileEntry{
		Path:  filepath.ToSlash(relPath),
		Name:  filepath.Base(relPath),
		IsDir: info.IsDir(),
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

func (s *FileService) ReadDiff(ctx context.Context, root string, path string) (string, error) {
	fullPath, err := safeJoin(root, path)
	if err != nil {
		return "", err
	}

	relPath, err := filepath.Rel(root, fullPath)
	if err != nil {
		return "", err
	}

	cmd := exec.CommandContext(ctx, "git", "-C", root, "diff", "--", relPath)
	out, err := cmd.Output()
	if err != nil {
		if _, ok := err.(*exec.ExitError); ok {
			return string(out), nil
		}
		return "", err
	}

	return string(out), nil
}

func safeJoin(root string, p string) (string, error) {
	if p == "" {
		return "", NewRPCError(-32602, "path is required")
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
