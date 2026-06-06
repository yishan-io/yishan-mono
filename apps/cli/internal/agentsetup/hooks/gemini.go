package hooks

import (
	"fmt"
	"path/filepath"
)

const (
	geminiManagedCommandMarker       = "YISHAN_MANAGED_HOOK=gemini"
	geminiLegacyManagedCommandMarker = "yishan-managed-hook=gemini"
)

type geminiHookCommand struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

type geminiHookDefinition struct {
	Matcher string              `json:"matcher,omitempty"`
	Hooks   []geminiHookCommand `json:"hooks,omitempty"`
}

type geminiHookInstaller struct{}

func (geminiHookInstaller) Install(ctx hookSetupContext) error {
	return ensureGeminiHookSettings(ctx.notifyScriptPath, ctx.homeDir, ctx.goos)
}

func ensureGeminiHookSettings(notifyScriptPath string, homeDir string, goos string) error {
	settingsPath := filepath.Join(homeDir, ".gemini", "settings.json")
	settings, err := readJSONObject(settingsPath)
	if err != nil {
		return fmt.Errorf("read Gemini settings: %w", err)
	}

	hooksValue, ok := settings["hooks"].(map[string]any)
	if !ok {
		hooksValue = map[string]any{}
		settings["hooks"] = hooksValue
	}

	for _, event := range buildManagedGeminiEvents(notifyScriptPath, goos) {
		currentDefinitions, _ := hooksValue[event.name].([]any)
		filteredDefinitions := make([]any, 0, len(currentDefinitions)+1)
		for _, definition := range currentDefinitions {
			cleaned, keep := removeManagedHookCommands(definition, geminiLegacyManagedCommandMarker)
			if !keep {
				continue
			}
			cleaned, keep = removeManagedHookCommands(cleaned, geminiManagedCommandMarker)
			if keep {
				filteredDefinitions = append(filteredDefinitions, cleaned)
			}
		}
		filteredDefinitions = append(filteredDefinitions, event.definition)
		hooksValue[event.name] = filteredDefinitions
	}

	return writeJSONObject(settingsPath, settings)
}

func buildManagedGeminiEvents(notifyScriptPath string, goos string) []struct {
	name       string
	definition geminiHookDefinition
} {
	return []struct {
		name       string
		definition geminiHookDefinition
	}{
		{name: "BeforeAgent", definition: geminiHookDefinition{Hooks: []geminiHookCommand{{Type: "command", Command: buildGeminiManagedCommand(notifyScriptPath, goos, "Start")}}}},
		{name: "AfterAgent", definition: geminiHookDefinition{Hooks: []geminiHookCommand{{Type: "command", Command: buildGeminiManagedCommand(notifyScriptPath, goos, "Stop")}}}},
		{name: "Notification", definition: geminiHookDefinition{Matcher: "ToolPermission", Hooks: []geminiHookCommand{{Type: "command", Command: buildGeminiManagedCommand(notifyScriptPath, goos, "PermissionRequest")}}}},
	}
}

func buildGeminiManagedCommand(notifyScriptPath string, goos string, eventName string) string {
	if goos == "windows" {
		return geminiManagedCommandMarker + " powershell.exe -NoProfile -ExecutionPolicy Bypass -File " + quotePowerShellPath(notifyScriptPath) + " --agent gemini --event " + eventName
	}
	return geminiManagedCommandMarker + " bash " + quoteShellPath(notifyScriptPath) + " --agent gemini --event " + eventName
}
