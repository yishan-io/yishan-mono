//go:build windows

package modellist

import (
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/runtime/shellenv"
)

var (
	enrichedEnv     []string
	enrichedEnvOnce sync.Once
)

func getEnrichedEnv() []string {
	enrichedEnvOnce.Do(func() {
		enrichedEnv = shellenv.ResolveEnvWithUserPath(os.Environ(), "")
		pathVal := ""
		for _, e := range enrichedEnv {
			if strings.HasPrefix(e, "PATH=") {
				pathVal = e[5:]
				break
			}
		}
		log.Info().
			Int("pathLen", len(pathVal)).
			Msg("enriched PATH computed")
	})
	return enrichedEnv
}

func isolateCmd(cmd *exec.Cmd) {
	cmd.Env = getEnrichedEnv()
}

func ShutdownShell() {
	shellenv.ShutdownLoginShell()
}
