package terminal

import (
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/runtime/shellenv"
)

const managedRuntimeRootDirName = shellenv.ManagedRuntimeRootDirName
const managedRuntimeOrigZdotdirEnvKey = shellenv.ManagedRuntimeOrigZdotdirEnvKey
const workspaceIDEnvKey = "YISHAN_WORKSPACE_ID"
const tabIDEnvKey = "YISHAN_TAB_ID"
const paneIDEnvKey = "YISHAN_PANE_ID"

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
	env := baseEnv
	if strings.TrimSpace(req.WorkspaceID) != "" {
		env = shellenv.UpsertEnv(env, workspaceIDEnvKey, strings.TrimSpace(req.WorkspaceID))
	}
	if strings.TrimSpace(req.TabID) != "" {
		env = shellenv.UpsertEnv(env, tabIDEnvKey, strings.TrimSpace(req.TabID))
	}
	if strings.TrimSpace(req.PaneID) != "" {
		env = shellenv.UpsertEnv(env, paneIDEnvKey, strings.TrimSpace(req.PaneID))
	}
	return env
}

