//go:build windows

package terminal

import (
	"os"
	"os/exec"
)

func stopProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	return cmd.Process.Kill()
}

func stopProcessByPID(pid int) error {
	if pid <= 0 {
		return nil
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return process.Kill()
}
