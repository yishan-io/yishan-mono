//go:build windows

package modellist

import "os/exec"

// isolateCmd is a no-op on Windows; SIGHUP does not exist and Bun's setsid()
// behaviour does not apply.
func isolateCmd(_ *exec.Cmd) {}
