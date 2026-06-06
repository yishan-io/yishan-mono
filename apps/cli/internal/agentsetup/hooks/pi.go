package hooks

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"path/filepath"
	"text/template"
)

//go:embed assets/pi-extension.ts.tmpl
var piExtensionTemplate string

const (
	piExtensionFileName = "yishan-hooks.ts"
	piExtensionMarker   = "// Yishan pi extension v1"
)

type piHookInstaller struct{}

func (piHookInstaller) Install(ctx hookSetupContext) error {
	return ensurePiExtension(ctx.notifyScriptPath, ctx.homeDir, ctx.goos)
}

func ensurePiExtension(notifyScriptPath string, homeDir string, goos string) error {
	extensionPath := filepath.Join(homeDir, ".pi", "agent", "extensions", piExtensionFileName)
	content := buildPiExtensionContent(notifyScriptPath, piExtensionMarker, goos)
	return writeTextFileIfChanged(extensionPath, content, 0o644)
}

func buildPiExtensionContent(notifyScriptPath string, marker string, goos string) string {
	notifyPathLiteral, _ := json.Marshal(notifyScriptPath)
	notifyCommand := "bash"
	notifyArgPrefix := []string{notifyScriptPath, "--agent", "pi", "--event"}
	if goos == "windows" {
		notifyCommand = "powershell.exe"
		notifyArgPrefix = []string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", notifyScriptPath, "--agent", "pi", "--event"}
	}
	argPrefixLiteral, _ := json.Marshal(notifyArgPrefix)

	var rendered bytes.Buffer
	tmpl := template.Must(template.New("pi-extension").Parse(piExtensionTemplate))
	if err := tmpl.Execute(&rendered, map[string]string{
		"Marker":           marker,
		"NotifyPathLiteral": string(notifyPathLiteral),
		"NotifyCommand":    notifyCommand,
		"ArgPrefixLiteral": string(argPrefixLiteral),
	}); err != nil {
		panic(err)
	}
	return rendered.String()
}
