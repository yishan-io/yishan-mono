package hooks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureAgentHookSetupMergesClaudeGeminiHooksAndOpenCodePlugin(t *testing.T) {
	homeDir := t.TempDir()
	configHome := filepath.Join(t.TempDir(), "config")
	notifyPath := filepath.Join(t.TempDir(), "notify's.sh")
	settingsPath := filepath.Join(homeDir, ".claude", "settings.json")
	codexHooksPath := filepath.Join(homeDir, ".codex", "hooks.json")
	cursorHooksPath := filepath.Join(homeDir, ".cursor", "hooks.json")

	existingSettings := `{
  "theme": "dark",
  "hooks": {
    "Stop": [
      {"hooks": [{"type": "command", "command": "custom-stop"}]},
      {"hooks": [{"type": "command", "command": "yishan-managed-hook=claude bash /old/notify.sh --agent claude --event Stop"}]}
    ]
  }
}`
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("create settings dir: %v", err)
	}
	if err := os.WriteFile(settingsPath, []byte(existingSettings), 0o644); err != nil {
		t.Fatalf("write settings: %v", err)
	}

	existingCodexHooks := `{
  "hooks": {
    "Stop": [
      {"hooks": [{"type": "command", "command": "custom-codex-stop"}]},
      {"hooks": [{"type": "command", "command": "yishan-managed-hook=codex bash /old/notify.sh --agent codex --event Stop"}]}
    ]
  }
}`
	if err := os.MkdirAll(filepath.Dir(codexHooksPath), 0o755); err != nil {
		t.Fatalf("create codex hooks dir: %v", err)
	}
	if err := os.WriteFile(codexHooksPath, []byte(existingCodexHooks), 0o644); err != nil {
		t.Fatalf("write codex hooks: %v", err)
	}

	existingCursorHooks := `{
  "version": 1,
  "hooks": {
    "stop": [
      {"command": "custom-cursor-stop"},
      {"command": "yishan-managed-hook=cursor bash /old/cursor-hook.sh Stop"}
    ]
  }
}`
	if err := os.MkdirAll(filepath.Dir(cursorHooksPath), 0o755); err != nil {
		t.Fatalf("create cursor hooks dir: %v", err)
	}
	if err := os.WriteFile(cursorHooksPath, []byte(existingCursorHooks), 0o644); err != nil {
		t.Fatalf("write cursor hooks: %v", err)
	}

	if err := EnsureAgentHookSetup(AgentHookSetupConfig{
		NotifyScriptPath: notifyPath,
		HomeDir:          homeDir,
		XDGConfigHome:    configHome,
		GOOS:             "darwin",
	}); err != nil {
		t.Fatalf("ensure hook setup: %v", err)
	}

	rawSettings, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(rawSettings, &settings); err != nil {
		t.Fatalf("parse settings: %v", err)
	}
	if settings["theme"] != "dark" {
		t.Fatalf("expected unrelated settings to be preserved")
	}

	hooksValue := settings["hooks"].(map[string]any)
	stopDefinitions := hooksValue["Stop"].([]any)
	if len(stopDefinitions) != 2 {
		t.Fatalf("expected custom Stop hook plus one managed hook, got %d", len(stopDefinitions))
	}
	settingsText := string(rawSettings)
	if strings.Contains(settingsText, "/old/notify.sh") {
		t.Fatalf("expected stale managed Claude hook to be replaced")
	}
	if !strings.Contains(settingsText, "custom-stop") {
		t.Fatalf("expected user Claude hook to be preserved")
	}
	stopCommand := commandFromDefinition(t, stopDefinitions[1])
	if !strings.Contains(stopCommand, "bash "+quoteShellPath(notifyPath)+" --agent claude --event Stop") {
		t.Fatalf("expected managed Claude hook to use quoted notify script path: %s", stopCommand)
	}
	if !strings.Contains(stopCommand, "YISHAN_MANAGED_HOOK=claude") {
		t.Fatalf("expected managed Claude hook to use new marker, got: %s", stopCommand)
	}
	if strings.Contains(settingsText, "yishan-managed-hook=claude") {
		t.Fatalf("expected legacy Claude hook marker to be replaced")
	}

	codexHooksRaw, err := os.ReadFile(codexHooksPath)
	if err != nil {
		t.Fatalf("read codex hooks: %v", err)
	}
	var codexHooksJSON map[string]any
	if err := json.Unmarshal(codexHooksRaw, &codexHooksJSON); err != nil {
		t.Fatalf("parse codex hooks: %v", err)
	}
	codexHooks := codexHooksJSON["hooks"].(map[string]any)
	codexStopDefinitions := codexHooks["Stop"].([]any)
	if len(codexStopDefinitions) != 2 {
		t.Fatalf("expected custom Codex Stop hook plus one managed hook, got %d", len(codexStopDefinitions))
	}
	codexHooksText := string(codexHooksRaw)
	if strings.Contains(codexHooksText, "/old/notify.sh") {
		t.Fatalf("expected stale managed Codex hook to be replaced")
	}
	if !strings.Contains(codexHooksText, "custom-codex-stop") {
		t.Fatalf("expected user Codex hook to be preserved")
	}
	codexStopCommand := commandFromDefinition(t, codexStopDefinitions[1])
	if !strings.Contains(codexStopCommand, "bash "+quoteShellPath(notifyPath)+" --agent codex --event Stop") {
		t.Fatalf("expected managed Codex hook to use quoted notify script path: %s", codexStopCommand)
	}
	if !strings.Contains(codexStopCommand, "YISHAN_MANAGED_HOOK=codex") {
		t.Fatalf("expected managed Codex hook to use new marker, got: %s", codexStopCommand)
	}
	if strings.Contains(codexHooksText, "yishan-managed-hook=codex") {
		t.Fatalf("expected legacy Codex hook marker to be replaced")
	}
	if _, ok := codexHooks["SessionStart"]; !ok {
		t.Fatalf("expected Codex SessionStart hook")
	}
	if _, ok := codexHooks["UserPromptSubmit"]; !ok {
		t.Fatalf("expected Codex UserPromptSubmit hook")
	}

	cursorHooksRaw, err := os.ReadFile(cursorHooksPath)
	if err != nil {
		t.Fatalf("read cursor hooks: %v", err)
	}
	var cursorHooksJSON map[string]any
	if err := json.Unmarshal(cursorHooksRaw, &cursorHooksJSON); err != nil {
		t.Fatalf("parse cursor hooks: %v", err)
	}
	cursorHooks := cursorHooksJSON["hooks"].(map[string]any)
	cursorStopDefinitions := cursorHooks["stop"].([]any)
	if len(cursorStopDefinitions) != 2 {
		t.Fatalf("expected custom Cursor stop hook plus one managed hook, got %d", len(cursorStopDefinitions))
	}
	cursorHooksText := string(cursorHooksRaw)
	if strings.Contains(cursorHooksText, "/old/cursor-hook.sh") {
		t.Fatalf("expected stale managed Cursor hook to be replaced")
	}
	if !strings.Contains(cursorHooksText, "custom-cursor-stop") {
		t.Fatalf("expected user Cursor hook to be preserved")
	}
	if !strings.Contains(cursorHooksText, "beforeSubmitPrompt") ||
		!strings.Contains(cursorHooksText, "beforeShellExecution") ||
		!strings.Contains(cursorHooksText, "beforeMCPExecution") {
		t.Fatalf("expected managed Cursor hook events to be present")
	}
	if !strings.Contains(cursorHooksText, "YISHAN_MANAGED_HOOK=cursor") {
		t.Fatalf("expected managed Cursor hook to use new marker")
	}
	if strings.Contains(cursorHooksText, "yishan-managed-hook=cursor") {
		t.Fatalf("expected legacy Cursor hook marker to be replaced")
	}

	cursorHookScriptRaw, err := os.ReadFile(filepath.Join(filepath.Dir(notifyPath), cursorHookScriptFileName))
	if err != nil {
		t.Fatalf("read cursor hook script: %v", err)
	}
	cursorHookScriptText := string(cursorHookScriptRaw)
	if !strings.Contains(cursorHookScriptText, `{"continue":true}`) {
		t.Fatalf("expected cursor hook script to auto-continue permission hooks")
	}
	if !strings.Contains(cursorHookScriptText, "--agent cursor --event") {
		t.Fatalf("expected cursor hook script to invoke notify script")
	}

	pluginPath := filepath.Join(configHome, "plugin", openCodePluginFileName)
	pluginRaw, err := os.ReadFile(pluginPath)
	if err != nil {
		t.Fatalf("read OpenCode plugin: %v", err)
	}
	pluginText := string(pluginRaw)
	if !strings.Contains(pluginText, openCodePluginMarker) {
		t.Fatalf("expected OpenCode plugin marker")
	}
	if !strings.Contains(pluginText, "process?.env?.YISHAN_TAB_ID") {
		t.Fatalf("expected OpenCode plugin to gate on terminal tab env")
	}
	if !strings.Contains(pluginText, "--agent opencode --event ${hookEventName}") {
		t.Fatalf("expected OpenCode plugin notifier command")
	}
	if !strings.Contains(pluginText, `"permission.asked"`) || !strings.Contains(pluginText, `"permission.ask"`) {
		t.Fatalf("expected OpenCode plugin to listen for current and legacy permission ask hooks")
	}
	if !strings.Contains(pluginText, `"permission.replied"`) {
		t.Fatalf("expected OpenCode plugin to resume after permission replies")
	}
	if !strings.Contains(pluginText, `"question.asked"`) || !strings.Contains(pluginText, `"question.replied"`) || !strings.Contains(pluginText, `"question.rejected"`) {
		t.Fatalf("expected OpenCode plugin to listen for question lifecycle events")
	}
	configRaw, err := os.ReadFile(filepath.Join(configHome, "opencode.json"))
	if err != nil {
		t.Fatalf("read OpenCode config: %v", err)
	}
	if string(configRaw) != "{}\n" {
		t.Fatalf("expected default OpenCode config overlay, got %q", string(configRaw))
	}

	piExtensionRaw, err := os.ReadFile(filepath.Join(homeDir, ".pi", "agent", "extensions", piExtensionFileName))
	if err != nil {
		t.Fatalf("read Pi extension: %v", err)
	}
	piExtensionText := string(piExtensionRaw)
	if !strings.Contains(piExtensionText, piExtensionMarker) {
		t.Fatalf("expected Pi extension marker")
	}
	if !strings.Contains(piExtensionText, `pi.on("before_agent_start"`) ||
		!strings.Contains(piExtensionText, `pi.on("session_shutdown"`) {
		t.Fatalf("expected Pi extension lifecycle hooks")
	}
	if !strings.Contains(piExtensionText, `"--agent"`) || !strings.Contains(piExtensionText, `"pi"`) || !strings.Contains(piExtensionText, `"--event"`) {
		t.Fatalf("expected Pi extension to call notify script with pi agent args")
	}

	geminiSettingsRaw, err := os.ReadFile(filepath.Join(homeDir, ".gemini", "settings.json"))
	if err != nil {
		t.Fatalf("read Gemini settings: %v", err)
	}
	var geminiSettings map[string]any
	if err := json.Unmarshal(geminiSettingsRaw, &geminiSettings); err != nil {
		t.Fatalf("parse Gemini settings: %v", err)
	}
	geminiHooks, ok := geminiSettings["hooks"].(map[string]any)
	if !ok {
		t.Fatalf("expected Gemini hooks map")
	}
	beforeAgentDefinitions, ok := geminiHooks["BeforeAgent"].([]any)
	if !ok || len(beforeAgentDefinitions) != 1 {
		t.Fatalf("expected exactly one managed Gemini BeforeAgent definition, got %#v", geminiHooks["BeforeAgent"])
	}
	beforeAgentCommand := commandFromDefinition(t, beforeAgentDefinitions[0])
	if !strings.Contains(beforeAgentCommand, "bash "+quoteShellPath(notifyPath)+" --agent gemini --event Start") {
		t.Fatalf("expected managed Gemini start command, got %s", beforeAgentCommand)
	}
	if !strings.Contains(beforeAgentCommand, "YISHAN_MANAGED_HOOK=gemini") {
		t.Fatalf("expected managed Gemini hook to use new marker, got: %s", beforeAgentCommand)
	}
	geminiSettingsText := string(geminiSettingsRaw)
	if strings.Contains(geminiSettingsText, "yishan-managed-hook=gemini") {
		t.Fatalf("expected legacy Gemini hook marker to be replaced")
	}
	notificationDefinitions, ok := geminiHooks["Notification"].([]any)
	if !ok || len(notificationDefinitions) != 1 {
		t.Fatalf("expected exactly one managed Gemini Notification definition, got %#v", geminiHooks["Notification"])
	}
	notificationDefinitionMap, ok := notificationDefinitions[0].(map[string]any)
	if !ok || notificationDefinitionMap["matcher"] != "ToolPermission" {
		t.Fatalf("expected Gemini Notification matcher ToolPermission, got %#v", notificationDefinitions[0])
	}
}

func TestEnsureAgentHookSetupUsesPowerShellCommandsOnWindows(t *testing.T) {
	homeDir := t.TempDir()
	configHome := filepath.Join(t.TempDir(), "config")
	// Use a temp dir for the notify script path so that filepath.Dir resolves
	// correctly on all platforms (previously used a raw Windows path which
	// caused cursor-hook.sh to be written to the package directory on Unix).
	notifyDir := t.TempDir()
	notifyPath := filepath.Join(notifyDir, "notify.ps1")

	if err := EnsureAgentHookSetup(AgentHookSetupConfig{
		NotifyScriptPath: notifyPath,
		HomeDir:          homeDir,
		XDGConfigHome:    configHome,
		GOOS:             "windows",
	}); err != nil {
		t.Fatalf("ensure hook setup: %v", err)
	}

	settingsRaw, err := os.ReadFile(filepath.Join(homeDir, ".claude", "settings.json"))
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(settingsRaw, &settings); err != nil {
		t.Fatalf("parse settings: %v", err)
	}
	hooksValue := settings["hooks"].(map[string]any)
	stopDefinitions := hooksValue["Stop"].([]any)
	stopCommand := commandFromDefinition(t, stopDefinitions[0])
	if !strings.Contains(stopCommand, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) ||
		!strings.Contains(stopCommand, "--agent claude") {
		t.Fatalf("expected PowerShell Claude command, got %s", stopCommand)
	}

	pluginRaw, err := os.ReadFile(filepath.Join(configHome, "plugin", openCodePluginFileName))
	if err != nil {
		t.Fatalf("read OpenCode plugin: %v", err)
	}
	if !strings.Contains(string(pluginRaw), "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${notifyPath}") {
		t.Fatalf("expected PowerShell OpenCode command")
	}

	geminiSettingsRaw, err := os.ReadFile(filepath.Join(homeDir, ".gemini", "settings.json"))
	if err != nil {
		t.Fatalf("read Gemini settings: %v", err)
	}
	if !strings.Contains(string(geminiSettingsRaw), `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) ||
		!strings.Contains(string(geminiSettingsRaw), `--agent gemini --event Start`) {
		t.Fatalf("expected PowerShell Gemini command, got %q", string(geminiSettingsRaw))
	}

	codexHooksRaw, err := os.ReadFile(filepath.Join(homeDir, ".codex", "hooks.json"))
	if err != nil {
		t.Fatalf("read codex hooks: %v", err)
	}
	if !strings.Contains(string(codexHooksRaw), `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) ||
		!strings.Contains(string(codexHooksRaw), `--agent codex --event SessionStart`) {
		t.Fatalf("expected PowerShell Codex command, got %q", string(codexHooksRaw))
	}

	cursorHooksRaw, err := os.ReadFile(filepath.Join(homeDir, ".cursor", "hooks.json"))
	if err != nil {
		t.Fatalf("read cursor hooks: %v", err)
	}
	if !strings.Contains(string(cursorHooksRaw), `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) ||
		!strings.Contains(string(cursorHooksRaw), ` PermissionRequest`) {
		t.Fatalf("expected PowerShell Cursor command, got %q", string(cursorHooksRaw))
	}

	cursorHookScriptPath := filepath.Join(notifyDir, cursorHookScriptFileName)
	cursorHookScriptRaw, err := os.ReadFile(cursorHookScriptPath)
	if err != nil {
		t.Fatalf("read cursor hook script: %v", err)
	}
	if !strings.Contains(string(cursorHookScriptRaw), `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) ||
		!strings.Contains(string(cursorHookScriptRaw), "notify.ps1") {
		t.Fatalf("expected PowerShell cursor hook script forwarding, got %q", string(cursorHookScriptRaw))
	}

	piExtensionRaw, err := os.ReadFile(filepath.Join(homeDir, ".pi", "agent", "extensions", piExtensionFileName))
	if err != nil {
		t.Fatalf("read Pi extension: %v", err)
	}
	if !strings.Contains(string(piExtensionRaw), `"powershell.exe"`) ||
		!strings.Contains(string(piExtensionRaw), `"-File"`) ||
		!strings.Contains(string(piExtensionRaw), `"--agent"`) ||
		!strings.Contains(string(piExtensionRaw), `"pi"`) {
		t.Fatalf("expected PowerShell Pi extension command, got %q", string(piExtensionRaw))
	}
}

func commandFromDefinition(t *testing.T, definition any) string {
	t.Helper()
	definitionMap, ok := definition.(map[string]any)
	if !ok {
		t.Fatalf("expected definition map, got %T", definition)
	}
	hooksValue, ok := definitionMap["hooks"].([]any)
	if !ok || len(hooksValue) == 0 {
		t.Fatalf("expected definition hooks, got %#v", definitionMap["hooks"])
	}
	hook, ok := hooksValue[0].(map[string]any)
	if !ok {
		t.Fatalf("expected hook map, got %T", hooksValue[0])
	}
	command, ok := hook["command"].(string)
	if !ok {
		t.Fatalf("expected hook command, got %#v", hook["command"])
	}
	return command
}
