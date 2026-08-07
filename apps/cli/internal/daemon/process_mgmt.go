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

const (
	daemonStartProbeTimeout = 250 * time.Millisecond
	daemonStartStopTimeout  = 10 * time.Second
	daemonStartReadyTimeout = 5 * time.Second
	daemonStartMaxAttempts  = 3
)

// StartDaemon starts a detached daemon for the profile and returns the state
// of the daemon that is now running. It enforces a single live daemon per
// profile via the exclusive profile lock: an already-healthy daemon is
// adopted, a stale one is stopped and replaced, and a concurrent start is
// resolved in favor of the healthy winner.
func StartDaemon(cfg StartConfig, statePath string) (RuntimeState, error) {
	lockPath := lockFilePathForState(statePath)

	// Fast path: a healthy daemon already serves this profile. It must also
	// hold the profile lock; a healthy but unlocked daemon is a pre-lock
	// legacy process that we replace so it can no longer outlive restarts.
	if state, err := LoadState(statePath); err == nil {
		healthy := ProbeHealth(state, daemonStartProbeTimeout)
		if healthy && IsLockHeld(lockPath) {
			log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon already running")
			return state, nil
		}
		if healthy {
			log.Warn().Int("pid", state.PID).Msg("daemon is running without the profile lock; restarting it")
		}
		log.Warn().Int("pid", state.PID).Msg("stopping stale daemon")
		if _, err := Stop(statePath, daemonStartStopTimeout); err != nil && !errors.Is(err, ErrNotRunning) {
			return RuntimeState{}, err
		}
	} else if !os.IsNotExist(err) {
		return RuntimeState{}, err
	}

	for attempt := 0; attempt < daemonStartMaxAttempts; attempt++ {
		if _, err := StartDetached(cfg); err != nil {
			return RuntimeState{}, err
		}

		state, err := WaitForReady(statePath, daemonStartReadyTimeout)
		if err == nil {
			log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon started")
			return state, nil
		}

		// Our child did not become ready, likely because another daemon holds
		// the profile lock. Adopt a healthy holder; stop a stale one and retry.
		holder, holderErr := LoadState(statePath)
		if holderErr == nil {
			if ProbeHealth(holder, daemonStartProbeTimeout) {
				log.Info().Int("pid", holder.PID).Msg("daemon already running")
				return holder, nil
			}
			if _, stopErr := Stop(statePath, daemonStartStopTimeout); stopErr == nil {
				continue
			}
		}
		if IsLockHeld(lockPath) {
			return RuntimeState{}, fmt.Errorf("start daemon: %w (another daemon holds the profile lock %q; run 'yishan daemon status' to inspect)", err, lockPath)
		}
		return RuntimeState{}, err
	}

	return RuntimeState{}, errors.New("failed to start daemon after multiple attempts")
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
	} else if cfg.LogFile != "" {
		// Redirect stderr to the log file so that Go runtime panics and other
		// unrecoverable crashes are captured rather than silently dropped into
		// /dev/null. The daemon writes structured JSON to the log file via
		// zerolog, but the Go runtime writes plain text panic stacks directly
		// to os.Stderr — without this redirect those are invisible.
		stderrFile, openErr := os.OpenFile(cfg.LogFile, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o600)
		if openErr == nil {
			command.Stderr = stderrFile
			defer stderrFile.Close()
		} else {
			command.Stderr = devNull
		}
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
