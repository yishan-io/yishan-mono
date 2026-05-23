package setup

import (
	"path/filepath"
	"runtime"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/config"
	hooksetup "yishan/apps/cli/internal/daemon/setup/hooks"
)

type AgentHookSetupConfig = hooksetup.AgentHookSetupConfig

// EnsureAgentHookSetup installs managed Claude, Gemini, and OpenCode hook integrations.
func EnsureAgentHookSetup(cfg AgentHookSetupConfig) error {
	return hooksetup.EnsureAgentHookSetup(cfg)
}

// EnsureManagedAgentRuntime materializes managed agent wrapper assets and hook configuration.
func EnsureManagedAgentRuntime() {
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
	}); err != nil {
		log.Warn().Err(err).Msg("failed to install agent hook setup")
	}
}

func resolveManagedHookRootDir() (string, error) {
	return config.HomeDir()
}
