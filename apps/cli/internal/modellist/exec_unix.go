//go:build !windows

package modellist

import (
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/runtime/shellenv"
)

// enrichedEnv is the full subprocess environment with an enriched PATH,
// computed once on first use. It uses ResolveEnvWithUserPath (same as
// cli_detector) which spawns a login shell to capture the user's full PATH
// including directories like ~/.opencode/bin. The result is cached so the
// login shell is only spawned once per daemon lifetime.
var (
	enrichedEnv     []string
	enrichedEnvOnce sync.Once
)

func getEnrichedEnv() []string {
	enrichedEnvOnce.Do(func() {
		enrichedEnv = shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
		pathVal := ""
		for _, e := range enrichedEnv {
			if strings.HasPrefix(e, "PATH=") {
				pathVal = e[5:]
				break
			}
		}
		hasOpenCodeBin := strings.Contains(pathVal, ".opencode/bin")
		hasYishanBin := strings.Contains(pathVal, ".yishan/bin")
		log.Info().
			Bool("hasOpenCodeBin", hasOpenCodeBin).
			Bool("hasYishanBin", hasYishanBin).
			Int("pathLen", len(pathVal)).
			Msg("enriched PATH computed")
	})
	return enrichedEnv
}

// isolateCmd prevents the subprocess from triggering SIGHUP delivery to the
// daemon. Bun-based CLIs (e.g. opencode) call setsid() on startup; when they
// do so as a direct child of the daemon process, the kernel may deliver SIGHUP
// to the daemon. Setting Setsid:true here puts the child in its own session
// before it can attempt that, eliminating the signal entirely.
//
// It also sets an enriched PATH (resolved once via the login shell, same
// approach as cli_detector) so tools like opencode are findable even when
// the daemon was launched from a GUI context with a minimal system PATH.
func isolateCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Env = getEnrichedEnv()
}

func ShutdownShell() {
	shellenv.ShutdownLoginShell()
}
