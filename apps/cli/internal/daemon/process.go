package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

var ErrNotRunning = errors.New("daemon is not running")

const detachedEnvKey = "YISHAN_DAEMON_DETACHED"

type RunConfig struct {
	Host         string
	Port         int
	JWTSecret    string
	JWTIssuer    string
	JWTAudience  string
	JWTRequired  bool
	RegisterNode func(NodeRegistration) error
}

type StartConfig struct {
	Run        RunConfig
	ConfigPath string
	LogLevel   string
	Stdout     io.Writer
	Stderr     io.Writer
}

func Run(cfg RunConfig, statePath string) error {
	state, err := LoadState(statePath)
	if err == nil {
		if IsProcessRunning(state.PID) {
			return fmt.Errorf("daemon already running at %s (pid %d)", net.JoinHostPort(state.Host, strconv.Itoa(state.Port)), state.PID)
		}
		if err := RemoveState(statePath); err != nil {
			log.Warn().Err(err).Msg("failed to remove stale daemon state file")
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("load daemon state: %w", err)
	}

	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)))
	if err != nil {
		return fmt.Errorf("listen daemon server: %w", err)
	}
	defer func() {
		if closeErr := listener.Close(); closeErr != nil {
			if errors.Is(closeErr, net.ErrClosed) {
				return
			}
			log.Warn().Err(closeErr).Msg("failed to close daemon listener")
		}
	}()

	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("unexpected listener address type %T", listener.Addr())
	}
	actualAddr := net.JoinHostPort(cfg.Host, strconv.Itoa(tcpAddr.Port))
	daemonIDPath := filepath.Join(filepath.Dir(statePath), IDFileName)
	daemonID, err := EnsureDaemonID(daemonIDPath)
	if err != nil {
		return fmt.Errorf("ensure daemon id: %w", err)
	}
	currentPID := os.Getpid()

	workspaceManager := workspace.NewManager()
	handler := NewJSONRPCHandler(workspaceManager)
	auth := NewJWTAuth(JWTAuthConfig{
		Secret:   cfg.JWTSecret,
		Issuer:   cfg.JWTIssuer,
		Audience: cfg.JWTAudience,
		Required: cfg.JWTRequired,
	})
	if err := auth.ValidateConfig(); err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.Handle("/ws", auth.Middleware(handler))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "running",
			"version":  buildinfo.Version,
			"daemonId": daemonID,
		})
	})

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	if err := SaveState(statePath, RuntimeState{
		PID:       currentPID,
		Host:      cfg.Host,
		Port:      tcpAddr.Port,
		StartedAt: time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("save daemon state: %w", err)
	}
	defer func() {
		if err := RemoveState(statePath); err != nil {
			log.Warn().Err(err).Msg("failed to remove daemon state file")
		}
	}()

	if cfg.RegisterNode != nil {
		agentDetectionStatus := ListAgentCLIDetectionStatuses()
		if err := cfg.RegisterNode(NodeRegistration{
			ID:                   daemonID,
			Endpoint:             "http://" + actualAddr,
			AgentDetectionStatus: agentDetectionStatus,
		}); err != nil {
			return fmt.Errorf("register daemon node: %w", err)
		}
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(stop)

	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Error().Err(err).Msg("failed to shutdown daemon server")
		}
	}()

	startLog := log.Info()
	if os.Getenv(detachedEnvKey) == "1" {
		startLog = log.Debug()
	}
	startLog.Str("address", actualAddr).Bool("jwt_required", cfg.JWTRequired).Msg("daemon server started")
	err = server.Serve(listener)
	if err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("daemon server failed: %w", err)
	}

	log.Debug().Msg("daemon server stopped")
	return nil
}

func Stop(statePath string, timeout time.Duration) (RuntimeState, error) {
	state, err := LoadState(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return RuntimeState{}, ErrNotRunning
		}
		return RuntimeState{}, fmt.Errorf("load daemon state: %w", err)
	}

	if !IsProcessRunning(state.PID) {
		if err := RemoveState(statePath); err != nil {
			log.Warn().Err(err).Msg("failed to remove stale daemon state file")
		}
		return RuntimeState{}, ErrNotRunning
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
	args = append(args, "--jwt-required="+strconv.FormatBool(cfg.Run.JWTRequired))
	if cfg.Run.JWTSecret != "" {
		args = append(args, "--jwt-secret", cfg.Run.JWTSecret)
	}
	if cfg.Run.JWTIssuer != "" {
		args = append(args, "--jwt-issuer", cfg.Run.JWTIssuer)
	}
	if cfg.Run.JWTAudience != "" {
		args = append(args, "--jwt-audience", cfg.Run.JWTAudience)
	}
	if cfg.ConfigPath != "" {
		args = append(args, "--config", cfg.ConfigPath)
	}
	if cfg.LogLevel != "" {
		args = append(args, "--log-level", cfg.LogLevel)
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
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := command.Start(); err != nil {
		return 0, fmt.Errorf("start daemon process: %w", err)
	}

	pid := command.Process.Pid
	if err := command.Process.Release(); err != nil {
		log.Warn().Err(err).Msg("failed to release daemon process handle")
	}

	return pid, nil
}

func IsHealthy(state RuntimeState, timeout time.Duration) bool {
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
		if err == nil && IsProcessRunning(state.PID) && IsHealthy(state, 250*time.Millisecond) {
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
