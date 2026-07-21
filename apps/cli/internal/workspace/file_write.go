package workspace

import (
	"os"
	"path/filepath"
)

func (s *FileService) Write(root string, path string, content string, mode uint32) (int, error) {
	fullPath, err := safeJoin(root, path, true)
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
	s.InvalidateWorkspacePaths(root, []string{path})

	return len(content), nil
}

func (s *FileService) Delete(root string, path string, recursive bool) error {
	fullPath, err := safeJoin(root, path, true)
	if err != nil {
		return err
	}

	if recursive {
		if err := os.RemoveAll(fullPath); err != nil {
			return err
		}
		s.InvalidateWorkspacePaths(root, []string{path})
		return nil
	}

	if err := os.Remove(fullPath); err != nil {
		return err
	}
	s.InvalidateWorkspacePaths(root, []string{path})

	return nil
}

func (s *FileService) Move(root string, fromPath string, toPath string) error {
	fromFullPath, err := safeJoin(root, fromPath, false)
	if err != nil {
		return err
	}
	toFullPath, err := safeJoin(root, toPath, true)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(toFullPath), 0o755); err != nil {
		return err
	}
	if err := os.Rename(fromFullPath, toFullPath); err != nil {
		return err
	}
	s.InvalidateWorkspacePaths(root, []string{fromPath, toPath})

	return nil
}

func (s *FileService) Mkdir(root string, path string, parents bool, mode uint32) error {
	fullPath, err := safeJoin(root, path, true)
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
	s.InvalidateWorkspacePaths(root, []string{path})

	return nil
}
