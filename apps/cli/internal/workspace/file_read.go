package workspace

import (
	"fmt"
	"os"
	"path/filepath"
)

func (s *FileService) Read(root string, path string) (string, error) {
	fullPath, err := safeJoin(root, path, false)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return "", err
	}
	if info.Size() > maxReadBytes {
		return "", NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("file exceeds %d byte read limit", maxReadBytes))
	}

	b, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}

	return string(b), nil
}

func (s *FileService) Stat(root string, path string) (FileEntry, error) {
	fullPath, err := safeJoin(root, path, false)
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
		Path:       filepath.ToSlash(relPath),
		Name:       filepath.Base(fullPath),
		IsDir:      info.IsDir(),
		Size:       info.Size(),
		Mode:       uint32(info.Mode()),
		ModifiedAt: formatModifiedAt(info),
	}, nil
}
