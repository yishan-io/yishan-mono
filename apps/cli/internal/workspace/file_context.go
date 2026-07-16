package workspace

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

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
		return markIgnoredEntries(root, path, entries), nil
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
	return markIgnoredEntries(root, path, merged), nil
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
			Path:       ContextLinkName,
			Name:       ContextLinkName,
			IsDir:      true,
			Size:       contextInfo.Size(),
			Mode:       uint32(contextInfo.Mode()),
			ModifiedAt: formatModifiedAt(contextInfo),
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

		info, err := entry.Info()
		if err != nil {
			return err
		}
		relFromContext, err := filepath.Rel(contextRoot, fullPath)
		if err != nil {
			return err
		}
		relPath := filepath.ToSlash(filepath.Join(ContextLinkName, relFromContext))
		if cleanPath != "" && relPath != cleanPath && !strings.HasPrefix(relPath, cleanPath+"/") {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		entries = append(entries, FileEntry{
			Path:       relPath,
			Name:       entry.Name(),
			IsDir:      entry.IsDir(),
			Size:       info.Size(),
			Mode:       uint32(info.Mode()),
			ModifiedAt: formatModifiedAt(info),
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
		Path:       ContextLinkName,
		Name:       ContextLinkName,
		IsDir:      false,
		Size:       info.Size(),
		Mode:       uint32(info.Mode()),
		ModifiedAt: formatModifiedAt(info),
	}}
}
