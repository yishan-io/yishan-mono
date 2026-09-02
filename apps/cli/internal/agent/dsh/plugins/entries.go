package plugins

import (
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var pluginEntryIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

func validatePluginEntries(entries []PluginEntry) ([]PluginEntry, error) {
	normalized := make([]PluginEntry, 0, len(entries))
	ids := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if !pluginEntryIDPattern.MatchString(entry.ID) || !isSafePluginPath(entry.Entrypoint) || ids[entry.ID] {
			return nil, ErrBundleNotLoadable
		}
		ids[entry.ID] = true
		if entry.Config == nil {
			entry.Config = map[string]any{}
		}
		if entry.Inject == nil {
			entry.Inject = []string{}
		}
		normalized = append(normalized, entry)
	}
	sort.Slice(normalized, func(i, j int) bool { return normalized[i].ID < normalized[j].ID })
	return normalized, nil
}

func validatePluginEntrypoints(root string, entries []PluginEntry) error {
	for _, entry := range entries {
		info, err := os.Lstat(filepath.Join(root, filepath.FromSlash(entry.Entrypoint)))
		if err != nil || !info.Mode().IsRegular() {
			return ErrBundleNotLoadable
		}
	}
	return nil
}

func isSafePluginPath(value string) bool {
	return value != "" && !strings.Contains(value, "\\") && path.Clean(value) == value &&
		!path.IsAbs(value) && !strings.HasPrefix(value, "../")
}
