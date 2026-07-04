package setup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/config"
	hooksetup "yishan/apps/cli/internal/agentsetup/hooks"
)

type AgentHookSetupConfig = hooksetup.AgentHookSetupConfig

const RemoteHostPolicyEnvKey = "YISHAN_REMOTE_HOST_POLICY"

// NotifyScriptPathEnvKey is the env var set in managed terminals pointing to the notify script.
const NotifyScriptPathEnvKey = "YISHAN_NOTIFY_SCRIPT_PATH"

// EnsureAgentHookSetup installs managed Claude, Gemini, and OpenCode hook integrations.
func EnsureAgentHookSetup(cfg AgentHookSetupConfig) error {
	return hooksetup.EnsureAgentHookSetup(cfg)
}

// EnsureManagedAgentRuntime materializes managed agent wrapper assets and hook configuration.
func EnsureManagedAgentRuntime(disablePersona bool) {
	managedRootDir, err := resolveManagedHookRootDir()
	if err != nil {
		log.Warn().Err(err).Msg("failed to resolve agent hook root")
		return
	}
	assets, err := ensureManagedHookAssets(managedRootDir)
	if err != nil {
		log.Warn().Err(err).Msg("failed to materialize agent hook assets")
		return
	}
	if err := ensureManagedShellSetup(managedRootDir); err != nil {
		log.Warn().Err(err).Msg("failed to install managed shell setup")
	}
	managedOpenCodeConfigHome := filepath.Join(managedRootDir, "opencode-config-home")

	notifyScriptPath := assets.notifyScriptPath
	if runtime.GOOS == "windows" {
		notifyScriptPath = assets.notifyPowerShellScriptPath
	}

	if err := EnsureAgentHookSetup(AgentHookSetupConfig{
		NotifyScriptPath: notifyScriptPath,
		XDGConfigHome:    managedOpenCodeConfigHome,
		DisablePersona:   disablePersona,
	}); err != nil {
		log.Warn().Err(err).Msg("failed to install agent hook setup")
	}

	if err := ensurePiNotifyPackage(); err != nil {
		log.Warn().Err(err).Msg("failed to install pi notify package")
	}
}

// RemoveManagedAgentRuntime removes managed hook entries from all agent configs.
func RemoveManagedAgentRuntime() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}
	var removeErr error
	if err := hooksetup.RemoveAgentHookSetup(hooksetup.AgentHookSetupConfig{
		HomeDir: homeDir,
	}); err != nil {
		removeErr = err
	}
	if err := removePiNotifyPackage(); err != nil {
		if removeErr != nil {
			removeErr = fmt.Errorf("%v; %w", removeErr, err)
		} else {
			removeErr = err
		}
	}
	return removeErr
}

func ensurePiNotifyPackage() error {
	cmd := exec.Command("pi", "install", "npm:@yishan/pi-notify")
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Run()
}

func removePiNotifyPackage() error {
	cmd := exec.Command("pi", "uninstall", "@yishan/pi-notify")
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Run()
}

func resolveManagedHookRootDir() (string, error) {
	return config.HomeDir()
}
