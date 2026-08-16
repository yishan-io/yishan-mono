package shellenv

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func readLoginShellPath(shellCommand string, timeout time.Duration) string {
	shellPath := ResolveUserShell(shellCommand)
	if strings.TrimSpace(shellPath) == "" {
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, shellPath, "-lic", `printf %s "$PATH"`)
	command.Stdin = nil
	output, err := command.Output()
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(output))
}
