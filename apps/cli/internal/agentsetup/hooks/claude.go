package hooks

import (
	"fmt"
	"path/filepath"
)

const (
	claudeManagedCommandMarker       = "YISHAN_MANAGED_HOOK=claude"
	claudeLegacyManagedCommandMarker = "yishan-managed-hook=claude"
)

type claudeHookCommand struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout *int   `json:"timeout,omitempty"`
}

type claudeHookDefinition struct {
	Matcher string              `json:"matcher,omitempty"`
	Hooks   []claudeHookCommand `json:"hooks,omitempty"`
}

type claudeHookInstaller struct{}

func (claudeHookInstaller) Install(ctx hookSetupContext) error {
	return ensureClaudeHookSettings(ctx.notifyScriptPath, ctx.homeDir, ctx.goos)
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
			cleaned, keep := removeManagedHookCommands(definition, claudeLegacyManagedCommandMarker)
			if !keep {
				continue
			}
			cleaned, keep = removeManagedHookCommands(cleaned, claudeManagedCommandMarker)
			if keep {
				filteredDefinitions = append(filteredDefinitions, cleaned)
			}
		}
		filteredDefinitions = append(filteredDefinitions, event.definition)
		hooksValue[event.name] = filteredDefinitions
	}

	return writeJSONObject(settingsPath, settings)
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
