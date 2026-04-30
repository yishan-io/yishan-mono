package setup

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureAgentHookSetupMergesClaudeHooksAndOpenCodePlugin(t *testing.T) {
	homeDir := t.TempDir()
	configHome := filepath.Join(t.TempDir(), "config")
	notifyPath := filepath.Join(t.TempDir(), "notify's.sh")
	settingsPath := filepath.Join(homeDir, ".claude", "settings.json")

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

	hooks := settings["hooks"].(map[string]any)
	stopDefinitions := hooks["Stop"].([]any)
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
	configRaw, err := os.ReadFile(filepath.Join(configHome, "opencode.json"))
	if err != nil {
		t.Fatalf("read OpenCode config: %v", err)
	}
	if string(configRaw) != "{}\n" {
		t.Fatalf("expected default OpenCode config overlay, got %q", string(configRaw))
	}
}

func TestEnsureAgentHookSetupUsesPowerShellCommandsOnWindows(t *testing.T) {
	homeDir := t.TempDir()
	configHome := filepath.Join(t.TempDir(), "config")
	notifyPath := `C:\Users\me\notify.ps1`

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
	hooks := settings["hooks"].(map[string]any)
	stopDefinitions := hooks["Stop"].([]any)
	stopCommand := commandFromDefinition(t, stopDefinitions[0])
	if !strings.Contains(stopCommand, `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\me\notify.ps1" --agent claude`) {
		t.Fatalf("expected PowerShell Claude command, got %s", stopCommand)
	}

	pluginRaw, err := os.ReadFile(filepath.Join(configHome, "plugin", openCodePluginFileName))
	if err != nil {
		t.Fatalf("read OpenCode plugin: %v", err)
	}
	if !strings.Contains(string(pluginRaw), "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${notifyPath}") {
		t.Fatalf("expected PowerShell OpenCode command")
	}
}

func commandFromDefinition(t *testing.T, definition any) string {
	t.Helper()
	definitionMap, ok := definition.(map[string]any)
	if !ok {
		t.Fatalf("expected definition map, got %T", definition)
	}
	hooks, ok := definitionMap["hooks"].([]any)
	if !ok || len(hooks) == 0 {
		t.Fatalf("expected definition hooks, got %#v", definitionMap["hooks"])
	}
	hook, ok := hooks[0].(map[string]any)
	if !ok {
		t.Fatalf("expected hook map, got %T", hooks[0])
	}
	command, ok := hook["command"].(string)
	if !ok {
		t.Fatalf("expected hook command, got %#v", hook["command"])
	}
	return command
}

func TestEnsureManagedHookAssetsWritesNotifyScripts(t *testing.T) {
	managedRootDir := t.TempDir()
	assets, err := ensureManagedHookAssets(managedRootDir)
	if err != nil {
		t.Fatalf("ensure assets: %v", err)
	}

	for _, path := range []string{
		assets.notifyScriptPath,
		assets.notifyPowerShellScriptPath,
		filepath.Join(managedRootDir, "bin", "claude"),
		filepath.Join(managedRootDir, "bin", "codex"),
		filepath.Join(managedRootDir, "bin", "opencode"),
		filepath.Join(managedRootDir, "bin", "gemini"),
		filepath.Join(managedRootDir, "bin", "pi"),
		filepath.Join(managedRootDir, "bin", "copilot"),
		filepath.Join(managedRootDir, "bin", "cursor"),
		filepath.Join(managedRootDir, "lib", "common.sh"),
		filepath.Join(managedRootDir, "lib", "hook_ingress.sh"),
	} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", path, err)
		}
		if info.Mode().Perm()&0o111 == 0 {
			t.Fatalf("expected %s to be executable, mode %s", path, info.Mode().Perm())
		}
	}

	if assets.managedBinDir != filepath.Join(managedRootDir, "bin") {
		t.Fatalf("expected managed bin dir under managed root, got %s", assets.managedBinDir)
	}
}

func TestEnsureManagedShellSetupWritesShellWrappers(t *testing.T) {
	managedRootDir := t.TempDir()
	if err := ensureManagedShellSetup(managedRootDir); err != nil {
		t.Fatalf("ensure shell setup: %v", err)
	}

	for _, path := range []string{
		filepath.Join(managedRootDir, "shell", "zsh", ".zshenv"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zprofile"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zshrc"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zlogin"),
		filepath.Join(managedRootDir, "shell", "bash", "rcfile"),
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read shell wrapper %s: %v", path, err)
		}
		content := string(raw)
		if !strings.Contains(content, managedRootDir) {
			t.Fatalf("expected %s to reference managed root dir", path)
		}
	}
}
