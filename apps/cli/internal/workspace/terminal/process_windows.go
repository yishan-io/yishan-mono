//go:build windows

package terminal

import "os/exec"

func stopProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	return cmd.Process.Kill()
}
