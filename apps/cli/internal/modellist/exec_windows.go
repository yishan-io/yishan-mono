//go:build windows

package modellist

import (
	"os"
	"os/exec"
	"sync"

	"yishan/apps/cli/internal/runtime/shellenv"
)

var (
	enrichedEnv     []string
	enrichedEnvOnce sync.Once
)

func getEnrichedEnv() []string {
	enrichedEnvOnce.Do(func() {
		enrichedEnv = shellenv.ResolveEnvWithUserPath(os.Environ(), "")
	})
	return enrichedEnv
}

func isolateCmd(cmd *exec.Cmd) {
	cmd.Env = getEnrichedEnv()
}

func ShutdownShell() {
	shellenv.ShutdownLoginShell()
}
