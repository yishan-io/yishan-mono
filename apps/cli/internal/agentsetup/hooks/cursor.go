package hooks

import (
	"bytes"
	_ "embed"
	"fmt"
	"path/filepath"
	"strings"
	"text/template"
)

//go:embed assets/cursor-hook.sh.tmpl
var cursorHookScriptTemplate string

const (
	cursorManagedCommandMarker       = "YISHAN_MANAGED_HOOK=cursor"
	cursorLegacyManagedCommandMarker = "yishan-managed-hook=cursor"
	cursorHookScriptFileName         = "cursor-hook.sh"
)

type cursorHookInstaller struct{}

func (cursorHookInstaller) Install(ctx hookSetupContext) error {
	cursorHookScriptPath, err := ensureCursorHookScript(ctx.notifyScriptPath, ctx.goos)
	if err != nil {
		return err
	}
	return ensureCursorHookSettings(cursorHookScriptPath, ctx.homeDir, ctx.goos)
}

func ensureCursorHookScript(notifyScriptPath string, goos string) (string, error) {
	hookPath := filepath.Join(filepath.Dir(notifyScriptPath), cursorHookScriptFileName)
	notifyForwardCommand := "bash " + quoteShellPath(notifyScriptPath) + " --agent cursor --event \"$event_name\" >/dev/null 2>&1 || true"
	if goos == "windows" {
		notifyForwardCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " + quotePowerShellPath(notifyScriptPath) + " --agent cursor --event \"$event_name\" >/dev/null 2>&1 || true"
	}

	var rendered bytes.Buffer
	tmpl := template.Must(template.New("cursor-hook").Parse(cursorHookScriptTemplate))
	if err := tmpl.Execute(&rendered, map[string]string{
		"NotifyForwardCommand": notifyForwardCommand,
	}); err != nil {
		panic(err)
	}
	script := rendered.String()
	if err := writeTextFileIfChanged(hookPath, script, 0o755); err != nil {
		return "", err
	}
	return hookPath, nil
}

func ensureCursorHookSettings(cursorHookScriptPath string, homeDir string, goos string) error {
	settingsPath := filepath.Join(homeDir, ".cursor", "hooks.json")
	settings, err := readJSONObject(settingsPath)
	if err != nil {
		return fmt.Errorf("read Cursor hooks: %w", err)
	}

	if _, ok := settings["version"]; !ok {
		settings["version"] = 1
	}

	hooksValue, ok := settings["hooks"].(map[string]any)
	if !ok {
		hooksValue = map[string]any{}
		settings["hooks"] = hooksValue
	}

	managedEntries := map[string]string{
		"beforeSubmitPrompt": buildCursorManagedCommand(cursorHookScriptPath, goos, "Start"),
		"stop":               buildCursorManagedCommand(cursorHookScriptPath, goos, "Stop"),
		"beforeShellExecution": buildCursorManagedCommand(
			cursorHookScriptPath,
			goos,
			"PermissionRequest",
		),
		"beforeMCPExecution": buildCursorManagedCommand(
			cursorHookScriptPath,
			goos,
			"PermissionRequest",
		),
	}

	for eventName, managedCommand := range managedEntries {
		currentEntries, _ := hooksValue[eventName].([]any)
		filtered := make([]any, 0, len(currentEntries)+1)
		for _, entry := range currentEntries {
			entryMap, ok := entry.(map[string]any)
			if !ok {
				filtered = append(filtered, entry)
				continue
			}
			command, _ := entryMap["command"].(string)
			if strings.Contains(command, cursorManagedCommandMarker) || strings.Contains(command, cursorLegacyManagedCommandMarker) {
				continue
			}
			filtered = append(filtered, entry)
		}
		filtered = append(filtered, map[string]any{"command": managedCommand})
		hooksValue[eventName] = filtered
	}

	return writeJSONObject(settingsPath, settings)
}

func buildCursorManagedCommand(cursorHookScriptPath string, goos string, eventName string) string {
	if goos == "windows" {
		return cursorManagedCommandMarker + " powershell.exe -NoProfile -ExecutionPolicy Bypass -File " + quotePowerShellPath(cursorHookScriptPath) + " " + eventName
	}
	return cursorManagedCommandMarker + " bash " + quoteShellPath(cursorHookScriptPath) + " " + eventName
}
