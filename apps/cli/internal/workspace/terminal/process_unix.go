//go:build !windows

package terminal

import (
	"os/exec"
	"syscall"
)

func stopProcess(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}

	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil && err != syscall.ESRCH {
		return err
	}

	return nil
}
