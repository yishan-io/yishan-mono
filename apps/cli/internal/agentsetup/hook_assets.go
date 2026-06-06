package setup

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

//go:embed assets/notify.sh
var notifyShellScript string

//go:embed assets/notify.ps1
var notifyPowerShellScript string

//go:embed assets/bin/claude
var claudeWrapperScript string

//go:embed assets/bin/codex
var codexWrapperScript string

//go:embed assets/bin/opencode
var openCodeWrapperScript string

//go:embed assets/bin/generic-agent
var genericAgentWrapperScript string

//go:embed assets/bin/open
var openWrapperScript string

//go:embed assets/bin/xdg-open
var xdgOpenWrapperScript string

//go:embed assets/lib/common.sh
var commonLibScript string

//go:embed assets/lib/hook_ingress.sh
var hookIngressLibScript string

type hookAssetPaths struct {
	managedBinDir              string
	notifyScriptPath           string
	notifyPowerShellScriptPath string
}

func ensureManagedHookAssets(managedRootDir string) (hookAssetPaths, error) {
	paths := hookAssetPaths{
		managedBinDir:              filepath.Join(managedRootDir, "bin"),
		notifyScriptPath:           filepath.Join(managedRootDir, "notify.sh"),
		notifyPowerShellScriptPath: filepath.Join(managedRootDir, "notify.ps1"),
	}

	assets := []struct {
		path    string
		content string
		mode    os.FileMode
	}{
		{path: filepath.Join(managedRootDir, "bin", "claude"), content: claudeWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "codex"), content: codexWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "opencode"), content: openCodeWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "gemini"), content: genericAgentWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "pi"), content: genericAgentWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "copilot"), content: genericAgentWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "bin", "cursor"), content: genericAgentWrapperScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "lib", "common.sh"), content: commonLibScript, mode: 0o755},
		{path: filepath.Join(managedRootDir, "lib", "hook_ingress.sh"), content: hookIngressLibScript, mode: 0o755},
	}
	if runtime.GOOS == "darwin" {
		assets = append(assets, struct {
			path    string
			content string
			mode    os.FileMode
		}{path: filepath.Join(managedRootDir, "bin", "open"), content: openWrapperScript, mode: 0o755})
	}
	if runtime.GOOS == "linux" {
		assets = append(assets, struct {
			path    string
			content string
			mode    os.FileMode
		}{path: filepath.Join(managedRootDir, "bin", "xdg-open"), content: xdgOpenWrapperScript, mode: 0o755})
	}

	for _, asset := range assets {
		if err := writeTextFileIfChanged(asset.path, asset.content, asset.mode); err != nil {
			return hookAssetPaths{}, fmt.Errorf("write wrapper asset %s: %w", asset.path, err)
		}
	}
	if err := writeTextFileIfChanged(paths.notifyScriptPath, notifyShellScript, 0o755); err != nil {
		return hookAssetPaths{}, fmt.Errorf("write notify shell script: %w", err)
	}
	if err := writeTextFileIfChanged(paths.notifyPowerShellScriptPath, notifyPowerShellScript, 0o755); err != nil {
		return hookAssetPaths{}, fmt.Errorf("write notify powershell script: %w", err)
	}

	return paths, nil
}

func writeTextFileIfChanged(path string, content string, mode os.FileMode) error {
	existing, err := os.ReadFile(path)
	if err == nil && string(existing) == content {
		if runtime.GOOS != "windows" {
			if chmodErr := os.Chmod(path, mode); chmodErr != nil {
				return chmodErr
			}
		}
		return nil
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), mode)
}
