//go:build windows

package process

import (
	"os/exec"
	"strconv"
	"syscall"
)

func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}

// forceStopProcess asks Windows to terminate the process and all descendants.
// The stdout reader also closes its pipe after this call, which guarantees the
// session finishes if a descendant escaped the process tree.
func forceStopProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	taskkill := exec.Command("taskkill", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
	if err := taskkill.Run(); err != nil {
		_ = cmd.Process.Kill()
	}
}
