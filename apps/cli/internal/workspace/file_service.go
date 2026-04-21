package workspace

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type FileEntry struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
	Mode  uint32 `json:"mode"`
}

type FileService struct{}

func NewFileService() *FileService {
	return &FileService{}
}

func (s *FileService) List(root string, path string) ([]FileEntry, error) {
	dir, err := safeJoinOptional(root, path)
	if err != nil {
		return nil, err
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

	return out, nil
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
