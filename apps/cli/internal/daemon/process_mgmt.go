package daemon

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
)

type StartConfig struct {
	Run        RunConfig
	ConfigPath string
	LogLevel   string
	LogFile    string
	Stdout     io.Writer
	Stderr     io.Writer
}

func Stop(statePath string, timeout time.Duration) (RuntimeState, error) {
	state, err := LoadState(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return RuntimeState{}, ErrNotRunning
		}
		return RuntimeState{}, fmt.Errorf("load daemon state: %w", err)
	}

	process, err := os.FindProcess(state.PID)
	if err != nil {
		return RuntimeState{}, fmt.Errorf("find daemon process %d: %w", state.PID, err)
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		return RuntimeState{}, fmt.Errorf("stop daemon process %d: %w", state.PID, err)
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !IsProcessRunning(state.PID) {
			if err := RemoveState(statePath); err != nil {
				log.Warn().Err(err).Msg("failed to remove daemon state file")
			}
			return state, nil
		}
		time.Sleep(200 * time.Millisecond)
	}

	return RuntimeState{}, fmt.Errorf("timed out waiting for daemon process %d to stop", state.PID)
}

func StartDetached(cfg StartConfig) (int, error) {
	executable, err := os.Executable()
	if err != nil {
		return 0, fmt.Errorf("resolve current executable: %w", err)
	}

	args := []string{"daemon", "run"}
	args = append(args, "--host", cfg.Run.Host)
	args = append(args, "--port", strconv.Itoa(cfg.Run.Port))
	args = append(args, "--relay-enabled="+strconv.FormatBool(cfg.Run.RelayEnabled))
	if cfg.Run.RelayURL != "" {
		args = append(args, "--relay-url", cfg.Run.RelayURL)
	}
	if cfg.ConfigPath != "" {
		args = append(args, "--config", cfg.ConfigPath)
	}
	if cfg.LogLevel != "" {
		args = append(args, "--log-level", cfg.LogLevel)
	}
	if cfg.LogFile != "" {
		args = append(args, "--log-file", cfg.LogFile)
	}

	command := exec.Command(executable, args...)
	command.Env = append(os.Environ(), detachedEnvKey+"=1")
	devNull, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		return 0, fmt.Errorf("open %s for daemon stdio: %w", os.DevNull, err)
	}
	defer func() {
		if closeErr := devNull.Close(); closeErr != nil {
			log.Warn().Err(closeErr).Msg("failed to close /dev/null handle")
		}
	}()
	if cfg.Stdout != nil {
		command.Stdout = cfg.Stdout
	} else {
		command.Stdout = devNull
	}
	if cfg.Stderr != nil {
		command.Stderr = cfg.Stderr
	} else {
		command.Stderr = devNull
	}
	command.SysProcAttr = sysProcAttr()

	if err := command.Start(); err != nil {
		return 0, fmt.Errorf("start daemon process: %w", err)
	}

	pid := command.Process.Pid
	if err := command.Process.Release(); err != nil {
		log.Warn().Err(err).Msg("failed to release daemon process handle")
	}

	return pid, nil
}

// ProbeHealth performs a live HTTP GET to the daemon's /healthz endpoint.
// It returns true only if the daemon responds with HTTP 200 within the given timeout.
// Unlike a simple state predicate, this function performs network I/O.
func ProbeHealth(state RuntimeState, timeout time.Duration) bool {
	if state.Host == "" || state.Port <= 0 {
		return false
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Get("http://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/healthz")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func WaitForReady(statePath string, timeout time.Duration) (RuntimeState, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		state, err := LoadState(statePath)
		if err == nil && IsProcessRunning(state.PID) && ProbeHealth(state, 250*time.Millisecond) {
			return state, nil
		}
		time.Sleep(200 * time.Millisecond)
	}

	return RuntimeState{}, fmt.Errorf("timed out waiting for daemon to become ready")
}

func Restart(cfg StartConfig, statePath string, stopTimeout time.Duration, readyTimeout time.Duration) (RuntimeState, error) {
	if _, err := Stop(statePath, stopTimeout); err != nil {
		if !errors.Is(err, ErrNotRunning) {
			return RuntimeState{}, err
		}
	}

	if _, err := StartDetached(cfg); err != nil {
		return RuntimeState{}, err
	}

	return WaitForReady(statePath, readyTimeout)
}
