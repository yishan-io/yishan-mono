package setup

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"text/template"

	"github.com/rs/zerolog/log"
)

//go:embed assets/opencode-plugin.js.tmpl
var openCodePluginTemplate string

const (
	claudeManagedCommandMarker = "yishan-managed-hook=claude"
	openCodePluginMarker       = "// Yishan opencode plugin v1"
	openCodePluginFileName     = "yishan-notify.js"
)

type AgentHookSetupConfig struct {
	NotifyScriptPath string
	HomeDir          string
	XDGConfigHome    string
	GOOS             string
}

type claudeHookCommand struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout *int   `json:"timeout,omitempty"`
}

type claudeHookDefinition struct {
	Matcher string              `json:"matcher,omitempty"`
	Hooks   []claudeHookCommand `json:"hooks,omitempty"`
}

// EnsureAgentHookSetup installs managed Claude and OpenCode hook integrations without modifying user-managed entries.
func EnsureAgentHookSetup(cfg AgentHookSetupConfig) error {
	notifyScriptPath := strings.TrimSpace(cfg.NotifyScriptPath)
	if notifyScriptPath == "" {
		return nil
	}

	homeDir, err := resolveHookHomeDir(cfg.HomeDir)
	if err != nil {
		return err
	}
	configHome := resolveHookConfigHome(homeDir, cfg.XDGConfigHome)
	goos := strings.TrimSpace(cfg.GOOS)
	if goos == "" {
		goos = runtime.GOOS
	}

	var setupErr error
	if err := ensureClaudeHookSettings(notifyScriptPath, homeDir, goos); err != nil {
		setupErr = err
	}
	if err := ensureManagedOpenCodeConfigOverlay(configHome); err != nil {
		if setupErr != nil {
			setupErr = fmt.Errorf("%v; %w", setupErr, err)
		} else {
			setupErr = err
		}
	}
	if err := ensureOpenCodePlugin(notifyScriptPath, configHome, goos); err != nil {
		if setupErr != nil {
			setupErr = fmt.Errorf("%v; %w", setupErr, err)
		} else {
			setupErr = err
		}
	}

	return setupErr
}

// EnsureManagedAgentRuntime materializes managed agent wrapper assets and hook configuration.
func EnsureManagedAgentRuntime() {
	managedRootDir, err := resolveManagedHookRootDir()
	if err != nil {
		log.Warn().Err(err).Msg("failed to resolve agent hook root")
		return
	}
	assets, err := ensureManagedHookAssets(managedRootDir)
	if err != nil {
		log.Warn().Err(err).Msg("failed to materialize agent hook assets")
		return
	}
	if err := ensureManagedShellSetup(managedRootDir); err != nil {
		log.Warn().Err(err).Msg("failed to install managed shell setup")
	}
	managedOpenCodeConfigHome := filepath.Join(managedRootDir, "opencode-config-home")

	notifyScriptPath := assets.notifyScriptPath
	if runtime.GOOS == "windows" {
		notifyScriptPath = assets.notifyPowerShellScriptPath
	}

	if err := EnsureAgentHookSetup(AgentHookSetupConfig{
		NotifyScriptPath: notifyScriptPath,
		XDGConfigHome:    managedOpenCodeConfigHome,
	}); err != nil {
		log.Warn().Err(err).Msg("failed to install agent hook setup")
	}
}

func resolveManagedHookRootDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".yishan"), nil
}

func ensureClaudeHookSettings(notifyScriptPath string, homeDir string, goos string) error {
	settingsPath := filepath.Join(homeDir, ".claude", "settings.json")
	settings, err := readJSONObject(settingsPath)
	if err != nil {
		return fmt.Errorf("read Claude settings: %w", err)
	}

	hooksValue, ok := settings["hooks"].(map[string]any)
	if !ok {
		hooksValue = map[string]any{}
		settings["hooks"] = hooksValue
	}

	for _, event := range buildManagedClaudeEvents(notifyScriptPath, goos) {
		currentDefinitions, _ := hooksValue[event.name].([]any)
		filteredDefinitions := make([]any, 0, len(currentDefinitions)+1)
		for _, definition := range currentDefinitions {
			cleaned, keep := removeManagedHookCommands(definition)
			if keep {
				filteredDefinitions = append(filteredDefinitions, cleaned)
			}
		}
		filteredDefinitions = append(filteredDefinitions, event.definition)
		hooksValue[event.name] = filteredDefinitions
	}

	return writeJSONObject(settingsPath, settings)
}

func ensureOpenCodePlugin(notifyScriptPath string, configHome string, goos string) error {
	pluginPath := filepath.Join(configHome, "plugin", openCodePluginFileName)
	content := buildOpenCodePluginContent(notifyScriptPath, "YISHAN_TAB_ID", openCodePluginMarker, goos)
	return writeTextFileIfChanged(pluginPath, content, 0o644)
}

func ensureManagedOpenCodeConfigOverlay(configHome string) error {
	configPath := filepath.Join(configHome, "opencode.json")
	if _, err := os.Stat(configPath); err == nil {
		return nil
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}

	return writeTextFileIfChanged(configPath, "{}\n", 0o644)
}

func buildManagedClaudeEvents(notifyScriptPath string, goos string) []struct {
	name       string
	definition claudeHookDefinition
} {
	return []struct {
		name       string
		definition claudeHookDefinition
	}{
		{name: "UserPromptSubmit", definition: claudeHookDefinition{Hooks: []claudeHookCommand{{Type: "command", Command: buildClaudeManagedCommand(notifyScriptPath, goos, "UserPromptSubmit")}}}},
		{name: "Stop", definition: claudeHookDefinition{Hooks: []claudeHookCommand{{Type: "command", Command: buildClaudeManagedCommand(notifyScriptPath, goos, "Stop")}}}},
		{name: "PostToolUse", definition: claudeHookDefinition{Matcher: "*", Hooks: []claudeHookCommand{{Type: "command", Command: buildClaudeManagedCommand(notifyScriptPath, goos, "PostToolUse")}}}},
		{name: "PostToolUseFailure", definition: claudeHookDefinition{Matcher: "*", Hooks: []claudeHookCommand{{Type: "command", Command: buildClaudeManagedCommand(notifyScriptPath, goos, "PostToolUseFailure")}}}},
		{name: "PermissionRequest", definition: claudeHookDefinition{Matcher: "*", Hooks: []claudeHookCommand{{Type: "command", Command: buildClaudeManagedCommand(notifyScriptPath, goos, "PermissionRequest")}}}},
	}
}

func buildClaudeManagedCommand(notifyScriptPath string, goos string, eventName string) string {
	if goos == "windows" {
		return claudeManagedCommandMarker + " powershell.exe -NoProfile -ExecutionPolicy Bypass -File " + quotePowerShellPath(notifyScriptPath) + " --agent claude --event " + eventName
	}
	return claudeManagedCommandMarker + " bash " + quoteShellPath(notifyScriptPath) + " --agent claude --event " + eventName
}

func removeManagedHookCommands(definition any) (any, bool) {
	definitionMap, ok := definition.(map[string]any)
	if !ok {
		return definition, true
	}
	hooks, ok := definitionMap["hooks"].([]any)
	if !ok {
		return definition, true
	}

	filteredHooks := make([]any, 0, len(hooks))
	for _, hook := range hooks {
		hookMap, ok := hook.(map[string]any)
		if !ok {
			filteredHooks = append(filteredHooks, hook)
			continue
		}
		command, _ := hookMap["command"].(string)
		if !strings.Contains(command, claudeManagedCommandMarker) {
			filteredHooks = append(filteredHooks, hook)
		}
	}

	if len(filteredHooks) == len(hooks) {
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

func buildOpenCodePluginContent(notifyScriptPath string, tabIDEnvKey string, pluginMarker string, goos string) string {
	notifyPathLiteral, _ := json.Marshal(notifyScriptPath)
	notifyCommand := "await $`bash ${notifyPath} --agent opencode --event ${hookEventName}`;"
	if goos == "windows" {
		notifyCommand = "await $`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${notifyPath} --agent opencode --event ${hookEventName}`;"
	}

	var rendered bytes.Buffer
	tmpl := template.Must(template.New("opencode-plugin").Parse(openCodePluginTemplate))
	if err := tmpl.Execute(&rendered, map[string]string{
		"PluginMarker":      pluginMarker,
		"TabIDEnvKey":       tabIDEnvKey,
		"NotifyPathLiteral": string(notifyPathLiteral),
		"NotifyCommand":     notifyCommand,
	}); err != nil {
		panic(err)
	}
	return rendered.String()
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

func quotePowerShellPath(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}
