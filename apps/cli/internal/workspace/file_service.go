package workspace

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

const (
	maxReadBytes          = 2 * 1024 * 1024
	maxDiffFileBytes      = 512 * 1024
	gitGutterDiffDebounce = 150
)

type FileEntry struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	IsDir      bool   `json:"isDir"`
	IsIgnored  bool   `json:"isIgnored"`
	Size       int64  `json:"size"`
	Mode       uint32 `json:"mode"`
	ModifiedAt string `json:"modifiedAt"`
}

type FileService struct {
	mu    sync.Mutex
	cache fileCacheStore
}

func NewFileService() *FileService {
	return &FileService{cache: newFileCacheStore()}
}

func (s *FileService) cachedDirectoryEntries(root string, path string) ([]FileEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cache.getDirectory(root, path)
}

func (s *FileService) storeCachedDirectoryEntries(root string, path string, entries []FileEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache.storeDirectory(root, path, entries)
}

func (s *FileService) InvalidateWorkspacePaths(root string, paths []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache.invalidatePaths(root, paths)
}

func formatModifiedAt(info os.FileInfo) string {
	return info.ModTime().UTC().Format(time.RFC3339)
}

func safeJoin(root string, p string, allowMissingLeaf bool) (string, error) {
	if p == "" {
		return "", NewRPCError(rpcCodeInvalidParams, "path is required")
	}

	if containsGitMetadataPath(p) {
		return "", NewRPCError(rpcCodePathRestricted, "path points to ignored git metadata")
	}

	candidate := filepath.Join(root, p)
	full, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}

	cleanRoot := filepath.Clean(root)
	resolvedRoot, resolveRootErr := filepath.EvalSymlinks(cleanRoot)
	if resolveRootErr != nil {
		resolvedRoot = cleanRoot
	}
	rel, err := filepath.Rel(cleanRoot, full)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", NewRPCError(rpcCodePathRestricted, "path escapes workspace root")
	}

	resolvedAncestor, err := resolveExistingAncestor(full, allowMissingLeaf)
	if err != nil {
		return "", err
	}
	if isWithinResolvedRoot(resolvedAncestor, resolvedRoot) {
		return full, nil
	}
	if usesContextLinkPath(p) {
		contextTarget, contextErr := resolveContextTarget(cleanRoot)
		if contextErr == nil && isWithinResolvedRoot(resolvedAncestor, contextTarget) {
			return full, nil
		}
	}
	return "", NewRPCError(rpcCodePathRestricted, "path escapes workspace root")
}

func resolveExistingAncestor(fullPath string, allowMissingLeaf bool) (string, error) {
	currentPath := fullPath
	if allowMissingLeaf {
		currentPath = filepath.Dir(fullPath)
	}
	for {
		resolvedPath, err := filepath.EvalSymlinks(currentPath)
		if err == nil {
			return filepath.Clean(resolvedPath), nil
		}
		if !os.IsNotExist(err) {
			return "", err
		}
		parentPath := filepath.Dir(currentPath)
		if parentPath == currentPath {
			return "", err
		}
		currentPath = parentPath
	}
}

func resolveContextTarget(root string) (string, error) {
	return filepath.EvalSymlinks(filepath.Join(root, ContextLinkName))
}

func isWithinResolvedRoot(path string, root string) bool {
	cleanPath := filepath.Clean(path)
	cleanRoot := filepath.Clean(root)
	if cleanPath == cleanRoot {
		return true
	}
	return strings.HasPrefix(cleanPath, cleanRoot+string(filepath.Separator))
}

func usesContextLinkPath(path string) bool {
	parts := strings.Split(filepath.ToSlash(filepath.Clean(path)), "/")
	return len(parts) > 0 && parts[0] == ContextLinkName
}

func safeJoinOptional(root string, p string, allowMissingLeaf bool) (string, error) {
	if strings.TrimSpace(p) == "" {
		return filepath.Clean(root), nil
	}
	return safeJoin(root, p, allowMissingLeaf)
}

func containsGitMetadataPath(path string) bool {
	return slices.Contains(strings.Split(filepath.ToSlash(filepath.Clean(path)), "/"), ".git")
}
