package hooks

import (
	"fmt"
	"runtime"
	"strings"
)

type AgentHookSetupConfig struct {
	NotifyScriptPath string
	HomeDir          string
	XDGConfigHome    string
	GOOS             string
}

type hookSetupContext struct {
	notifyScriptPath string
	homeDir          string
	configHome       string
	goos             string
}

type agentHookInstaller interface {
	Install(ctx hookSetupContext) error
}

// EnsureAgentHookSetup installs managed Claude, Gemini, and OpenCode hook integrations.
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

	ctx := hookSetupContext{
		notifyScriptPath: notifyScriptPath,
		homeDir:          homeDir,
		configHome:       configHome,
		goos:             goos,
	}

	installers := []agentHookInstaller{
		claudeHookInstaller{},
		geminiHookInstaller{},
		codexHookInstaller{},
		openCodeHookInstaller{},
		cursorHookInstaller{},
		piHookInstaller{},
	}

	var setupErr error
	for _, installer := range installers {
		if err := installer.Install(ctx); err != nil {
			if setupErr != nil {
				setupErr = fmt.Errorf("%v; %w", setupErr, err)
			} else {
				setupErr = err
			}
		}
	}

	return setupErr
}
