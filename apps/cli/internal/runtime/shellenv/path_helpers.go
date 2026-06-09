package shellenv

import (
	"os"
	"path/filepath"
	"strings"
)

func EnsurePathHasExistingDirectories(env []string, directories []string) []string {
	currentPath := EnvValueOrDefault(env, "PATH", "")
	pathDirs := strings.Split(currentPath, string(os.PathListSeparator))
	pathSet := make(map[string]bool, len(pathDirs))
	for _, d := range pathDirs {
		pathSet[d] = true
	}

	var toAppend []string
	for _, dir := range directories {
		if strings.TrimSpace(dir) == "" || pathSet[dir] {
			continue
		}
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			toAppend = append(toAppend, dir)
			pathSet[dir] = true
		}
	}

	if len(toAppend) == 0 {
		return env
	}

	newPath := strings.Join(append(pathDirs, toAppend...), string(os.PathListSeparator))
	if strings.TrimSpace(currentPath) == "" {
		newPath = strings.Join(toAppend, string(os.PathListSeparator))
	}
	return UpsertEnv(env, "PATH", newPath)
}

func normalizePathValue(pathValue string, homeDir string) string {
	if strings.TrimSpace(pathValue) == "" {
		return ""
	}

	parts := strings.Split(pathValue, string(os.PathListSeparator))
	for i, part := range parts {
		switch {
		case part == "~":
			parts[i] = homeDir
		case strings.HasPrefix(part, "~/"):
			parts[i] = filepath.Join(homeDir, part[2:])
		default:
			parts[i] = part
		}
	}
	return strings.Join(parts, string(os.PathListSeparator))
}

