package modellist

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// resolveCLIBinary resolves one agent CLI binary to an absolute path using the
// supplied environment's PATH. It must be called before exec.Command when the
// binary name is used bare: exec.Command eagerly resolves bare names against
// the current process's own PATH (Go 1.19+ caches the LookPath result in
// Cmd.Err at construction time), and GUI-launched daemons run with a minimal
// PATH (e.g. /usr/bin:/bin:/usr/sbin:/sbin). Setting cmd.Env afterwards via
// isolateCmd is too late for that lookup, so without this the CLI fetch fails
// with "executable file not found in $PATH" and model listing silently falls
// back to the static defaults.
func resolveCLIBinary(binary string, env []string) (string, error) {
	if strings.TrimSpace(binary) == "" {
		return "", fmt.Errorf("empty binary name")
	}
	path := shellenv.ResolveExecutablePathFromEnv(binary, env)
	if path == "" && runtime.GOOS == "windows" {
		// ResolveExecutablePathFromEnv stats only the literal name and misses
		// PATHEXT variants (pi.exe, pi.bat). exec.LookPath probes PATHEXT
		// against the process PATH, matching the pre-resolution behavior of
		// exec.Command("pi", ...) on Windows.
		if resolved, err := exec.LookPath(binary); err == nil {
			path = resolved
		}
	}
	if path == "" {
		return "", fmt.Errorf("%s not found in resolved PATH", binary)
	}
	return path, nil
}

// enrichedCLIEnv returns the environment used to locate agent CLI binaries and
// run their model-list commands. It aliases getEnrichedEnv (the env isolateCmd
// applies): the full login-shell env merged with the daemon's own env (same as
// agentmanager when launching pi sessions) so provider credentials exported in
// shell profiles (e.g. AWS_* for Amazon Bedrock) are visible to
// `pi --list-models`, then PATH-enriched. Without the login-shell merge, the
// model list would omit env-configured providers that the chat tab's pi
// session sees. It is a var so tests can inject a controlled environment.
var enrichedCLIEnv = getEnrichedEnv
