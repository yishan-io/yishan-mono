package fswatch

import "path/filepath"

func emitPathChanged(config Config, path string) {
	config.OnPathChanged(path)
}

func emitError(config Config, err error) {
	if err == nil || config.OnError == nil {
		return
	}
	config.OnError(err)
}

func shouldWatchDir(config Config, path string) bool {
	if config.ShouldWatchDir == nil {
		return true
	}
	return config.ShouldWatchDir(path)
}

func shouldDescendDir(config Config, path string) bool {
	if config.ShouldDescendDir == nil {
		return true
	}
	return config.ShouldDescendDir(path)
}

func dedupePaths(paths []string) []string {
	seen := make(map[string]bool, len(paths))
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		path = canonicalizePath(path)
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true
		result = append(result, path)
	}
	return result
}

func canonicalizePath(path string) string {
	if path == "" {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return filepath.Clean(resolved)
	}
	return filepath.Clean(path)
}
