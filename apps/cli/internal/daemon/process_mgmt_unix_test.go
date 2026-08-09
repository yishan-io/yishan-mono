//go:build !windows

package daemon

import (
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"testing"
	"time"
)

const stopProcessHelperEnv = "YISHAN_DAEMON_STOP_PROCESS_HELPER"

// TestStopProcessSignalsAndWaitsForExit verifies the shared signal+wait path
// behind Stop and StopPID against a real child process.
func TestStopProcessSignalsAndWaitsForExit(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}

	cmd := exec.Command(exe, "-test.run=TestStopProcessHelperProcess")
	cmd.Env = append(os.Environ(), stopProcessHelperEnv+"=1")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}

	// Reap the child so it does not linger as a zombie; kill(pid, 0) treats
	// zombies as running, which would otherwise make the wait loop time out.
	reaped := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(reaped)
	}()
	defer func() { <-reaped }()

	if err := stopProcess(cmd.Process.Pid, 5*time.Second); err != nil {
		t.Fatalf("stopProcess: %v", err)
	}
}

// TestStopProcessHelperProcess is not a real test: it is re-executed as the
// child above and exits cleanly when signalled with SIGTERM.
func TestStopProcessHelperProcess(t *testing.T) {
	if os.Getenv(stopProcessHelperEnv) != "1" {
		return
	}
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGTERM)
	<-sigs
	os.Exit(0)
}
