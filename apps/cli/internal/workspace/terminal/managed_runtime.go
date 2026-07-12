package terminal

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/runtime/shellenv"
)

const managedRuntimeRootDirName = shellenv.ManagedRuntimeRootDirName
const managedRuntimeOrigZdotdirEnvKey = shellenv.ManagedRuntimeOrigZdotdirEnvKey
const workspaceIDEnvKey = "YISHAN_WORKSPACE_ID"
const projectIDEnvKey = "YISHAN_PROJECT_ID"
const orgIDEnvKey = "YISHAN_ORG_ID"
const tabIDEnvKey = "YISHAN_TAB_ID"
const paneIDEnvKey = "YISHAN_PANE_ID"
const notifyScriptPathEnvKey = "YISHAN_NOTIFY_SCRIPT_PATH"

func resolveManagedBashRcfilePath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, managedRuntimeRootDirName, "shell", "bash", "rcfile")
}

func resolveManagedRuntimeEnv(baseEnv []string, command string) []string {
	return shellenv.ResolveManagedRuntimeEnv(baseEnv, command)
}

func resolveSessionMetadataEnv(baseEnv []string, req StartRequest) []string {
	env := ResolveObserverSessionEnv(baseEnv, req.WorkspaceID, req.TabID, req.PaneID)
	env = upsertSessionEnv(env, projectIDEnvKey, req.ProjectID)
	env = upsertSessionEnv(env, orgIDEnvKey, req.OrgID)
	if piAgentDir, err := config.ManagedPiAgentDir(); err == nil {
		env = shellenv.UpsertEnv(env, config.PiAgentDirEnvKey, piAgentDir)
	}
	return env
}

// ResolveObserverSessionEnv injects the hook/notification session metadata used
// by Yishan-managed agent runtimes.
func ResolveObserverSessionEnv(baseEnv []string, workspaceID string, tabID string, paneID string) []string {
	env := baseEnv
	env = upsertSessionEnv(env, workspaceIDEnvKey, workspaceID)
	env = upsertSessionEnv(env, tabIDEnvKey, tabID)
	env = upsertSessionEnv(env, paneIDEnvKey, paneID)
	if notifyPath, err := resolveNotifyScriptPath(); err == nil {
		env = shellenv.UpsertEnv(env, notifyScriptPathEnvKey, notifyPath)
	}
	return env
}

func upsertSessionEnv(env []string, key string, value string) []string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return env
	}
	return shellenv.UpsertEnv(env, key, trimmedValue)
}

func resolveNotifyScriptPath() (string, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}
	notifyName := "notify.sh"
	if runtime.GOOS == "windows" {
		notifyName = "notify.ps1"
	}
	return filepath.Join(yishanHome, notifyName), nil
}
