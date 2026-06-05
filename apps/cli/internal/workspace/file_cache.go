package workspace

import "strings"

type workspaceFileCache struct {
	directories map[string][]FileEntry
}

type fileCacheStore struct {
	workspaces map[string]workspaceFileCache
}

func newFileCacheStore() fileCacheStore {
	return fileCacheStore{workspaces: make(map[string]workspaceFileCache)}
}

func (s *fileCacheStore) getDirectory(root string, path string) ([]FileEntry, bool) {
	workspaceCache, ok := s.workspaces[root]
	if !ok {
		return nil, false
	}
	entries, ok := workspaceCache.directories[normalizeCachePath(path)]
	if !ok {
		return nil, false
	}
	return cloneFileEntries(entries), true
}

func (s *fileCacheStore) storeDirectory(root string, path string, entries []FileEntry) {
	workspaceCache := s.workspaces[root]
	if workspaceCache.directories == nil {
		workspaceCache.directories = make(map[string][]FileEntry)
	}
	workspaceCache.directories[normalizeCachePath(path)] = cloneFileEntries(entries)
	s.workspaces[root] = workspaceCache
}

func (s *fileCacheStore) invalidatePaths(root string, paths []string) {
	workspaceCache, ok := s.workspaces[root]
	if !ok {
		return
	}
	for _, path := range paths {
		normalizedPath := normalizeCachePath(path)
		if normalizedPath == "" {
			delete(s.workspaces, root)
			return
		}
		prefix := normalizedPath + "/"
		for cachedPath := range workspaceCache.directories {
			if cachedPath == normalizedPath || strings.HasPrefix(cachedPath, prefix) {
				delete(workspaceCache.directories, cachedPath)
			}
		}
		delete(workspaceCache.directories, parentCachePath(normalizedPath))
	}
	if len(workspaceCache.directories) == 0 {
		delete(s.workspaces, root)
		return
	}
	s.workspaces[root] = workspaceCache
}

func normalizeCachePath(path string) string {
	return strings.Trim(strings.ReplaceAll(strings.TrimSpace(path), "\\", "/"), "/")
}

func parentCachePath(path string) string {
	normalizedPath := normalizeCachePath(path)
	separatorIndex := strings.LastIndex(normalizedPath, "/")
	if separatorIndex < 0 {
		return ""
	}
	return normalizedPath[:separatorIndex]
}

func cloneFileEntries(entries []FileEntry) []FileEntry {
	return append([]FileEntry(nil), entries...)
}
