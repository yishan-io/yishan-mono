package hooks

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

type AgentHookSetupConfig struct {
	NotifyScriptPath string
	HomeDir          string
	XDGConfigHome    string
	GOOS             string
	DisablePersona   bool
}

type hookSetupContext struct {
	notifyScriptPath string
	homeDir          string
	configHome       string
	goos             string
	disablePersona   bool
}

type agentHookInstaller interface {
	Install(ctx hookSetupContext) error
}

type agentHookRemover interface {
	Remove(ctx hookSetupContext) error
}

// EnsureAgentHookSetup installs managed Claude, Gemini, and OpenCode hook integrations.
func EnsureAgentHookSetup(cfg AgentHookSetupConfig) error {
	ctx, err := buildHookContext(cfg)
	if err != nil {
		return err
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

// RemoveAgentHookSetup removes managed hook entries from all agent configs.
func RemoveAgentHookSetup(cfg AgentHookSetupConfig) error {
	ctx, err := buildHookContext(cfg)
	if err != nil {
		return err
	}

	removers := []agentHookRemover{
		claudeHookInstaller{},
		geminiHookInstaller{},
		codexHookInstaller{},
		openCodeHookInstaller{},
		cursorHookInstaller{},
		piHookInstaller{},
	}

	var removeErr error
	for _, remover := range removers {
		if err := remover.Remove(ctx); err != nil {
			if removeErr != nil {
				removeErr = fmt.Errorf("%v; %w", removeErr, err)
			} else {
				removeErr = err
			}
		}
	}

	return removeErr
}

func buildHookContext(cfg AgentHookSetupConfig) (hookSetupContext, error) {
	notifyScriptPath := strings.TrimSpace(cfg.NotifyScriptPath)

	homeDir, err := resolveHookHomeDir(cfg.HomeDir)
	if err != nil {
		return hookSetupContext{}, err
	}
	configHome := resolveHookConfigHome(homeDir, cfg.XDGConfigHome)
	goos := strings.TrimSpace(cfg.GOOS)
	if goos == "" {
		goos = runtime.GOOS
	}

	return hookSetupContext{
		notifyScriptPath: notifyScriptPath,
		homeDir:          homeDir,
		configHome:       configHome,
		goos:             goos,
		disablePersona:   cfg.DisablePersona,
	}, nil
}

func removeManagedCommandsFromConfig(path string, eventNames []string, markers ...string) error {
	config, err := readJSONObject(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	hooksValue, ok := config["hooks"].(map[string]any)
	if !ok {
		return nil
	}

	changed := false
	for _, eventName := range eventNames {
		definitions, _ := hooksValue[eventName].([]any)
		filtered := make([]any, 0, len(definitions))
		for _, definition := range definitions {
			cleaned, keep := definition, true
			for _, marker := range markers {
				cleaned, keep = removeManagedHookCommands(cleaned, marker)
				if !keep {
					break
				}
			}
			if keep {
				filtered = append(filtered, cleaned)
			}
		}
		if len(filtered) != len(definitions) {
			changed = true
		}
		if len(filtered) == 0 {
			delete(hooksValue, eventName)
		} else {
			hooksValue[eventName] = filtered
		}
	}

	if !changed {
		return nil
	}

	if len(hooksValue) == 0 {
		delete(config, "hooks")
	}

	return writeJSONObject(path, config)
}
