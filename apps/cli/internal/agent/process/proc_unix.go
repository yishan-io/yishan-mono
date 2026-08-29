//go:build !windows

package process

import (
	"os/exec"
	"syscall"
)

func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}

// forceStopProcess kills the session process group. Setsid makes the agent the
// group leader, so this also kills descendants that inherited its stdout pipe.
// The negative PID still identifies the group after the direct child has exited.
func forceStopProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil {
		_ = cmd.Process.Kill() // process may not have entered its own group
	}
}
