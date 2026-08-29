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
	Run              RunConfig
	ConfigPath       string
	LogLevel         string
	LogFile          string
	HasCustomLogFile bool
	Stdout           io.Writer
	Stderr           io.Writer
}

const (
	daemonStartProbeTimeout = 250 * time.Millisecond
	daemonStartStopTimeout  = 10 * time.Second
	daemonStartReadyTimeout = 5 * time.Second
	daemonStartMaxAttempts  = 3
)

// startDecision is what StartDaemon must do about an existing daemon before
// spawning, resolved from the profile lock and state files.
type startDecision int

const (
	// startAdopt: a healthy daemon already owns the profile (verified as the
	// live lock holder); return its state instead of starting a new one.
	startAdopt startDecision = iota
	// startReplace: a live daemon owns the profile but is unhealthy or
	// unverifiable; stop it and start a fresh one.
	startReplace
	// startFresh: no live daemon owns the profile; safe to start a new one.
	startFresh
	// startRefuse: a live holder exists but cannot be identified; starting is
	// refused because spawning would risk a duplicate daemon.
	startRefuse
)

// planStart decides how StartDaemon must handle an existing daemon before
// spawning. The flock holder is the ownership authority: a healthy holder is
// adopted, an unhealthy or unverifiable holder is stopped and replaced, and
// starting is refused while a live but unidentifiable holder exists — even
// when daemon.state.json is missing or stale.
//
// state is nil when the state file is missing or stale (LoadState removes
// stale files for dead pids). stateHealthy is the ProbeHealth result of the
// recorded state.
func planStart(lockHeld bool, holderPID int, holderAlive bool, state *RuntimeState, stateHealthy bool) (startDecision, int) {
	if !lockHeld {
		// No flock holder. A state-recorded daemon is a pre-lock legacy
		// process: replace it so it can no longer outlive restarts without a
		// lock to arbitrate ownership.
		if state != nil {
			return startReplace, state.PID
		}
		return startFresh, 0
	}

	if holderPID > 0 && holderAlive {
		// The live lock holder is identified. Adopt it only when the state
		// file verifies it is healthy; anything else is stopped and replaced.
		if state != nil && state.PID == holderPID && stateHealthy {
			return startAdopt, 0
		}
		return startReplace, holderPID
	}

	// The lock is held but the holder cannot be identified from the lock
	// file. Trust a healthy state record, stop a stale one, and refuse when
	// there is no way to identify the holder at all.
	if state != nil && stateHealthy {
		return startAdopt, 0
	}
	if state != nil {
		return startReplace, state.PID
	}
	return startRefuse, 0
}

// resolveStartAction inspects the profile lock and state files and returns
// what StartDaemon must do before spawning, plus the pid to stop when the
// decision is startReplace.
func resolveStartAction(lockPath, statePath string, probeTimeout time.Duration) (startDecision, int, RuntimeState) {
	lockHeld := isLockHeld(lockPath)
	holderPID := LockHolderPID(lockPath)

	loaded, err := LoadState(statePath)
	var state RuntimeState
	var stateHealthy bool
	var statePtr *RuntimeState
	if err == nil {
		state = loaded
		stateHealthy = ProbeHealth(state, probeTimeout)
		statePtr = &state
	}

	decision, pid := planStart(lockHeld, holderPID, holderPID > 0 && IsProcessRunning(holderPID), statePtr, stateHealthy)
	return decision, pid, state
}

// StartDaemon starts a detached daemon for the profile and returns the state
// of the daemon that is now running. Ownership is keyed off the exclusive
// profile lock, never the state file: a healthy lock holder is adopted, an
// unhealthy or unverifiable one is stopped and replaced, and a new daemon is
// never spawned while a live holder exists — even when daemon.state.json is
// missing or stale.
func StartDaemon(cfg StartConfig, statePath string) (RuntimeState, error) {
	lockPath := lockFilePathForState(statePath)

	decision, pid, existing := resolveStartAction(lockPath, statePath, daemonStartProbeTimeout)
	switch decision {
	case startAdopt:
		log.Info().Int("pid", existing.PID).Str("address", net.JoinHostPort(existing.Host, strconv.Itoa(existing.Port))).Msg("daemon already running")
		return existing, nil
	case startReplace:
		log.Warn().Int("pid", pid).Msg("stopping existing daemon before start")
		if err := stopPID(pid, daemonStartStopTimeout); err != nil && !errors.Is(err, ErrNotRunning) {
			return RuntimeState{}, err
		}
	case startRefuse:
		return RuntimeState{}, fmt.Errorf("start daemon: another daemon holds the profile lock %q; run 'yishan daemon status' to inspect", lockPath)
	}

	for attempt := 0; attempt < daemonStartMaxAttempts; attempt++ {
		if _, err := StartDetached(cfg); err != nil {
			return RuntimeState{}, err
		}

		state, err := waitForReady(statePath, daemonStartReadyTimeout)
		if err == nil {
			log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon started")
			return state, nil
		}

		// Our child did not become ready, likely because another daemon won
		// the profile lock. Re-resolve the holder: adopt it, replace it, or
		// refuse — never spawn alongside a live holder.
		decision, pid, existing := resolveStartAction(lockPath, statePath, daemonStartProbeTimeout)
		switch decision {
		case startAdopt:
			log.Info().Int("pid", existing.PID).Msg("daemon already running")
			return existing, nil
		case startReplace:
			if stopErr := stopPID(pid, daemonStartStopTimeout); stopErr != nil && !errors.Is(stopErr, ErrNotRunning) {
				return RuntimeState{}, stopErr
			}
			continue
		case startRefuse:
			return RuntimeState{}, fmt.Errorf("start daemon: %w (another daemon holds the profile lock %q; run 'yishan daemon status' to inspect)", err, lockPath)
		default:
			return RuntimeState{}, err
		}
	}

	return RuntimeState{}, errors.New("failed to start daemon after multiple attempts")
}

// stopProcess sends SIGTERM to pid and waits up to timeout for the process
// to exit. It is the shared signal+wait path for Stop and stopPID.
func stopProcess(pid int, timeout time.Duration) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("find daemon process %d: %w", pid, err)
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("stop daemon process %d: %w", pid, err)
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !IsProcessRunning(pid) {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}

	return fmt.Errorf("timed out waiting for daemon process %d to stop", pid)
}

// Stop stops the daemon recorded in the profile state file and waits for it
// to exit. It returns ErrNotRunning when the state file is missing or the
// recorded process is no longer alive. The state file is left in place: it
// is an address book written at start, and stale entries are cleaned by
// readers (LoadState, statusDaemon).
func Stop(statePath string, timeout time.Duration) (RuntimeState, error) {
	state, err := LoadState(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return RuntimeState{}, ErrNotRunning
		}
		return RuntimeState{}, fmt.Errorf("load daemon state: %w", err)
	}

	if err := stopProcess(state.PID, timeout); err != nil {
		return RuntimeState{}, err
	}
	return state, nil
}

// stopPID stops the daemon process with the given pid — typically the live
// lock holder resolved from the profile lock file — and waits for it to
// exit. It returns ErrNotRunning when the pid is not a live process. It is
// used when the state file is missing or stale and a state-based Stop cannot
// resolve the daemon.
func stopPID(pid int, timeout time.Duration) error {
	if pid <= 0 {
		return ErrNotRunning
	}
	if !IsProcessRunning(pid) {
		return ErrNotRunning
	}
	return stopProcess(pid, timeout)
}

func buildDetachedArgs(cfg StartConfig) []string {
	args := []string{"daemon", "run", "--host", cfg.Run.Host, "--port", strconv.Itoa(cfg.Run.Port)}
	args = append(args, "--relay-enabled="+strconv.FormatBool(cfg.Run.RelayEnabled))
	args = appendOptionalArg(args, "--relay-url", cfg.Run.RelayURL)
	args = appendOptionalArg(args, "--config", cfg.ConfigPath)
	args = appendOptionalArg(args, "--log-level", cfg.LogLevel)
	args = appendOptionalArg(args, "--log-file", cfg.LogFile)
	args = append(args, "--dsh-enabled="+strconv.FormatBool(cfg.Run.DSHEnabled))
	args = append(args, "--dsh-developer-mode="+strconv.FormatBool(cfg.Run.DSHDeveloperMode))
	args = appendOptionalArg(args, "--dsh-node-path", cfg.Run.DSHNodePath)
	args = appendOptionalArg(args, "--dsh-runtime-path", cfg.Run.DSHRuntimePath)
	args = appendOptionalArg(args, "--dsh-provider", cfg.Run.DSHProvider)
	return appendOptionalArg(args, "--dsh-model", cfg.Run.DSHModel)
}

func appendOptionalArg(args []string, flag string, value string) []string {
	if value == "" {
		return args
	}
	return append(args, flag, value)
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
	// Pass --log-file only when the caller explicitly configured it. The
	// detached process still receives LogFile as its initial stderr destination,
	// but resolving the default itself lets it switch structured logs to the
	// active account after bootstrap.
	if cfg.HasCustomLogFile && cfg.LogFile != "" {
		args = append(args, "--log-file", cfg.LogFile)
	}
	args = append(args, "--dsh-enabled="+strconv.FormatBool(cfg.Run.DSHEnabled))
	args = appendOptionalArg(args, "--dsh-node-path", cfg.Run.DSHNodePath)
	args = appendOptionalArg(args, "--dsh-runtime-path", cfg.Run.DSHRuntimePath)
	args = appendOptionalArg(args, "--dsh-provider", cfg.Run.DSHProvider)
	args = appendOptionalArg(args, "--dsh-model", cfg.Run.DSHModel)

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

func waitForReady(statePath string, timeout time.Duration) (RuntimeState, error) {
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

// resolveStopPID returns the pid of the daemon that currently owns the
// profile and must be stopped before a restart: the live lock holder when it
// can be identified from the lock file, otherwise the state-recorded legacy
// daemon. It returns 0 when no live daemon owns the profile.
func resolveStopPID(lockPath, statePath string) int {
	lockHeld := isLockHeld(lockPath)
	holderPID := LockHolderPID(lockPath)
	if lockHeld && holderPID > 0 && IsProcessRunning(holderPID) {
		return holderPID
	}

	state, err := LoadState(statePath)
	if err != nil {
		return 0
	}
	// A state-recorded daemon without a live lock holder is a pre-lock
	// legacy process.
	return state.PID
}

// Restart stops the daemon that owns the profile — found via the lock file
// when the state file is missing or stale — and starts a fresh one.
func Restart(cfg StartConfig, statePath string, stopTimeout time.Duration, readyTimeout time.Duration) (RuntimeState, error) {
	lockPath := lockFilePathForState(statePath)

	if pid := resolveStopPID(lockPath, statePath); pid > 0 {
		if err := stopPID(pid, stopTimeout); err != nil && !errors.Is(err, ErrNotRunning) {
			return RuntimeState{}, err
		}
	}

	if _, err := StartDetached(cfg); err != nil {
		return RuntimeState{}, err
	}

	return waitForReady(statePath, readyTimeout)
}
