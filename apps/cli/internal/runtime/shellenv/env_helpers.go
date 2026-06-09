package shellenv

import (
	"os"
	"path/filepath"
	"strings"
)

func EnvValueOrDefault(env []string, key string, fallback string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) && strings.TrimSpace(strings.TrimPrefix(entry, prefix)) != "" {
			return strings.TrimPrefix(entry, prefix)
		}
	}
	return fallback
}

func UpsertEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func PrependPathValue(pathValue string, directory string) string {
	if strings.TrimSpace(directory) == "" {
		return pathValue
	}
	if strings.TrimSpace(pathValue) == "" {
		return directory
	}
	return directory + string(os.PathListSeparator) + pathValue
}

func CommonUserBinDirectories() []string {
	directories := []string{"/opt/homebrew/bin", "/usr/local/bin"}
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return directories
	}

	return append(directories,
		filepath.Join(homeDir, ManagedRuntimeRootDirName, "bin"),
		filepath.Join(homeDir, ".opencode", "bin"),
		filepath.Join(homeDir, ".local", "bin"),
		filepath.Join(homeDir, ".bun", "bin"),
		filepath.Join(homeDir, ".npm-global", "bin"),
		filepath.Join(homeDir, "go", "bin"),
		filepath.Join(homeDir, ".cargo", "bin"),
	)
}
