package hooks

import (
	"fmt"
	"path/filepath"
)

const (
	codexManagedCommandMarker       = "YISHAN_MANAGED_HOOK=codex"
	codexLegacyManagedCommandMarker = "yishan-managed-hook=codex"
)

type codexHookCommand struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout *int   `json:"timeout,omitempty"`
}

type codexHookDefinition struct {
	Matcher string             `json:"matcher,omitempty"`
	Hooks   []codexHookCommand `json:"hooks,omitempty"`
}

type codexHookInstaller struct{}

func (codexHookInstaller) Install(ctx hookSetupContext) error {
	return ensureCodexHookSettings(ctx.notifyScriptPath, ctx.homeDir, ctx.goos)
}

func ensureCodexHookSettings(notifyScriptPath string, homeDir string, goos string) error {
	settingsPath := filepath.Join(homeDir, ".codex", "hooks.json")
	settings, err := readJSONObject(settingsPath)
	if err != nil {
		return fmt.Errorf("read Codex hooks: %w", err)
	}

	hooksValue, ok := settings["hooks"].(map[string]any)
	if !ok {
		hooksValue = map[string]any{}
		settings["hooks"] = hooksValue
	}

	for _, event := range buildManagedCodexEvents(notifyScriptPath, goos) {
		currentDefinitions, _ := hooksValue[event.name].([]any)
		filteredDefinitions := make([]any, 0, len(currentDefinitions)+1)
		for _, definition := range currentDefinitions {
			cleaned, keep := removeManagedHookCommands(definition, codexLegacyManagedCommandMarker)
			if !keep {
				continue
			}
			cleaned, keep = removeManagedHookCommands(cleaned, codexManagedCommandMarker)
			if keep {
				filteredDefinitions = append(filteredDefinitions, cleaned)
			}
		}
		filteredDefinitions = append(filteredDefinitions, event.definition)
		hooksValue[event.name] = filteredDefinitions
	}

	return writeJSONObject(settingsPath, settings)
}

func buildManagedCodexEvents(notifyScriptPath string, goos string) []struct {
	name       string
	definition codexHookDefinition
} {
	return []struct {
		name       string
		definition codexHookDefinition
	}{
		{name: "SessionStart", definition: codexHookDefinition{Hooks: []codexHookCommand{{Type: "command", Command: buildCodexManagedCommand(notifyScriptPath, goos, "SessionStart")}}}},
		{name: "UserPromptSubmit", definition: codexHookDefinition{Hooks: []codexHookCommand{{Type: "command", Command: buildCodexManagedCommand(notifyScriptPath, goos, "UserPromptSubmit")}}}},
		{name: "Stop", definition: codexHookDefinition{Hooks: []codexHookCommand{{Type: "command", Command: buildCodexManagedCommand(notifyScriptPath, goos, "Stop")}}}},
		{name: "Notification", definition: codexHookDefinition{Matcher: "*approval_request*", Hooks: []codexHookCommand{{Type: "command", Command: buildCodexManagedCommand(notifyScriptPath, goos, "PermissionRequest")}}}},
	}
}

func buildCodexManagedCommand(notifyScriptPath string, goos string, eventName string) string {
	if goos == "windows" {
		return codexManagedCommandMarker + " powershell.exe -NoProfile -ExecutionPolicy Bypass -File " + quotePowerShellPath(notifyScriptPath) + " --agent codex --event " + eventName
	}
	return codexManagedCommandMarker + " bash " + quoteShellPath(notifyScriptPath) + " --agent codex --event " + eventName
}
