//go:build !windows

package modellist

import (
	"os/exec"
	"syscall"
)

// isolateCmd prevents the subprocess from triggering SIGHUP delivery to the
// daemon. Bun-based CLIs (e.g. opencode) call setsid() on startup; when they
// do so as a direct child of the daemon process, the kernel may deliver SIGHUP
// to the daemon. Setting Setsid:true here puts the child in its own session
// before it can attempt that, eliminating the signal entirely.
func isolateCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
