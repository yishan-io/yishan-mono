package hooks

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"os"
	"path/filepath"
	"text/template"
)

//go:embed assets/opencode-plugin.js.tmpl
var openCodePluginTemplate string

//go:embed assets/opencode-memory-plugin.ts.tmpl
var openCodeMemoryPluginTemplate string

const (
	openCodePluginMarker        = "// Yishan opencode plugin v1"
	openCodePluginFileName      = "yishan-notify.js"
	openCodeMemoryPluginMarker   = "// Yishan memory plugin v1"
	openCodeMemoryPluginFileName = "ys-memory.ts"
)

type openCodeHookInstaller struct{}

func (openCodeHookInstaller) Install(ctx hookSetupContext) error {
	if err := ensureManagedOpenCodeConfigOverlay(ctx.configHome); err != nil {
		return err
	}
	if err := ensureOpenCodePlugin(ctx.notifyScriptPath, ctx.configHome, ctx.goos); err != nil {
		return err
	}
	return ensureOpenCodeMemoryPlugin(ctx.configHome, ctx.disablePersona)
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

func ensureOpenCodeMemoryPlugin(configHome string, disablePersona bool) error {
	pluginPath := filepath.Join(configHome, "plugin", openCodeMemoryPluginFileName)
	content := buildOpenCodeMemoryPluginContent(openCodeMemoryPluginMarker, disablePersona)
	return writeTextFileIfChanged(pluginPath, content, 0o644)
}

func buildOpenCodeMemoryPluginContent(pluginMarker string, disablePersona bool) string {
	var rendered bytes.Buffer
	tmpl := template.Must(template.New("opencode-memory-plugin").Parse(openCodeMemoryPluginTemplate))
	if err := tmpl.Execute(&rendered, map[string]any{
		"PluginMarker":   pluginMarker,
		"DisablePersona": disablePersona,
	}); err != nil {
		panic(err)
	}
	return rendered.String()
}

func (openCodeHookInstaller) Remove(ctx hookSetupContext) error {
	pluginPath := filepath.Join(ctx.configHome, "plugin", openCodePluginFileName)
	if err := os.Remove(pluginPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	memoryPluginPath := filepath.Join(ctx.configHome, "plugin", openCodeMemoryPluginFileName)
	if err := os.Remove(memoryPluginPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
