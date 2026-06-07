package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type MCPInstallResult struct {
	ConfigPaths []string
}

func EnsureMCPConfig() (*MCPInstallResult, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home dir: %w", err)
	}

	result := &MCPInstallResult{}

	if path, err := ensureOpenCodeMCPConfig(homeDir); err != nil {
		return result, fmt.Errorf("opencode mcp: %w", err)
	} else if path != "" {
		result.ConfigPaths = append(result.ConfigPaths, path)
	}

	if path, err := ensureClaudeMCPConfig(homeDir); err != nil {
		return result, fmt.Errorf("claude mcp: %w", err)
	} else if path != "" {
		result.ConfigPaths = append(result.ConfigPaths, path)
	}

	return result, nil
}

func RemoveMCPConfig() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}

	if err := removeOpenCodeMCPConfig(homeDir); err != nil {
		return fmt.Errorf("opencode mcp: %w", err)
	}

	if err := removeClaudeMCPConfig(homeDir); err != nil {
		return fmt.Errorf("claude mcp: %w", err)
	}

	return nil
}

const yishanMCPServerName = "yishan"

func ensureOpenCodeMCPConfig(homeDir string) (string, error) {
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(homeDir, ".config")
	}
	configPath := filepath.Join(configHome, "opencode", "opencode.json")

	config, err := readJSONConfig(configPath)
	if err != nil {
		return "", err
	}

	if _, ok := config["mcpServers"]; !ok {
		config["mcpServers"] = map[string]any{}
	}
	mcpServers, _ := config["mcpServers"].(map[string]any)
	mcpServers[yishanMCPServerName] = map[string]any{
		"type":    "local",
		"command": []string{"yishan", "mcp"},
	}

	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return "", err
	}
	if err := writeJSONConfig(configPath, config); err != nil {
		return "", err
	}
	return configPath, nil
}

func removeOpenCodeMCPConfig(homeDir string) error {
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(homeDir, ".config")
	}
	configPath := filepath.Join(configHome, "opencode", "opencode.json")

	config, err := readJSONConfig(configPath)
	if err != nil {
		return err
	}

	if mcpServers, ok := config["mcpServers"].(map[string]any); ok {
		delete(mcpServers, yishanMCPServerName)
		if len(mcpServers) == 0 {
			delete(config, "mcpServers")
		}
	}

	return writeJSONConfig(configPath, config)
}

func ensureClaudeMCPConfig(homeDir string) (string, error) {
	configPath := filepath.Join(homeDir, ".claude", "claude_desktop_config.json")

	config, err := readJSONConfig(configPath)
	if err != nil {
		return "", err
	}

	if _, ok := config["mcpServers"]; !ok {
		config["mcpServers"] = map[string]any{}
	}
	mcpServers, _ := config["mcpServers"].(map[string]any)
	mcpServers[yishanMCPServerName] = map[string]any{
		"command": "yishan",
		"args":    []string{"mcp"},
	}

	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return "", err
	}
	if err := writeJSONConfig(configPath, config); err != nil {
		return "", err
	}
	return configPath, nil
}

func removeClaudeMCPConfig(homeDir string) error {
	configPath := filepath.Join(homeDir, ".claude", "claude_desktop_config.json")

	config, err := readJSONConfig(configPath)
	if err != nil {
		return err
	}

	if mcpServers, ok := config["mcpServers"].(map[string]any); ok {
		delete(mcpServers, yishanMCPServerName)
		if len(mcpServers) == 0 {
			delete(config, "mcpServers")
		}
	}

	return writeJSONConfig(configPath, config)
}

func readJSONConfig(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}

	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if value == nil {
		return map[string]any{}, nil
	}
	return value, nil
}

func writeJSONConfig(path string, value map[string]any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(encoded, '\n'), 0o644)
}
