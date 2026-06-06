package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func removeManagedHookCommands(definition any, marker string) (any, bool) {
	definitionMap, ok := definition.(map[string]any)
	if !ok {
		return definition, true
	}
	hooksValue, ok := definitionMap["hooks"].([]any)
	if !ok {
		return definition, true
	}

	filteredHooks := make([]any, 0, len(hooksValue))
	for _, hook := range hooksValue {
		hookMap, ok := hook.(map[string]any)
		if !ok {
			filteredHooks = append(filteredHooks, hook)
			continue
		}
		command, _ := hookMap["command"].(string)
		if !strings.Contains(command, marker) {
			filteredHooks = append(filteredHooks, hook)
		}
	}

	if len(filteredHooks) == len(hooksValue) {
		return definition, true
	}
	if len(filteredHooks) == 0 {
		return nil, false
	}

	cleaned := make(map[string]any, len(definitionMap))
	for key, value := range definitionMap {
		cleaned[key] = value
	}
	cleaned["hooks"] = filteredHooks
	return cleaned, true
}

func readJSONObject(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}

	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, fmt.Errorf("JSON root is not an object")
	}
	return value, nil
}

func writeJSONObject(path string, value map[string]any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return writeTextFileIfChanged(path, string(encoded)+"\n", 0o644)
}

func resolveHookHomeDir(homeDir string) (string, error) {
	resolved := strings.TrimSpace(homeDir)
	if resolved == "" {
		var err error
		resolved, err = os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home dir: %w", err)
		}
	}
	if strings.TrimSpace(resolved) == "" {
		return "", fmt.Errorf("failed to resolve home directory for hook setup")
	}
	return resolved, nil
}

func resolveHookConfigHome(homeDir string, xdgConfigHome string) string {
	if strings.TrimSpace(xdgConfigHome) != "" {
		return strings.TrimSpace(xdgConfigHome)
	}
	if strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")) != "" {
		return strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME"))
	}
	return filepath.Join(homeDir, ".config")
}

func writeTextFileIfChanged(path string, content string, mode os.FileMode) error {
	existing, err := os.ReadFile(path)
	if err == nil && string(existing) == content {
		if runtime.GOOS != "windows" {
			if chmodErr := os.Chmod(path, mode); chmodErr != nil {
				return chmodErr
			}
		}
		return nil
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), mode)
}

func quoteShellPath(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", `"'"'`) + "'"
}

func quotePowerShellPath(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}
