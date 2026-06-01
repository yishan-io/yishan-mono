package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"yishan/apps/cli/internal/buildinfo"
	agentsetup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/nodeid"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

var ErrNotRunning = errors.New("daemon is not running")

const detachedEnvKey = "YISHAN_DAEMON_DETACHED"

type RunConfig struct {
	Host         string
	Port         int
	RelayEnabled bool
	RelayURL     string
	// LogFilePath is the resolved path to the daemon log file.
	// Set by the command layer; passed through to handlers for diagnostics.
	LogFilePath string
}

func Run(cfg RunConfig, statePath string, runtime *cliruntime.Runtime) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}

	// ── Phase 1: stale state guard ─────────────────────────────────────────
	state, err := LoadState(statePath)
	if err == nil {
		return fmt.Errorf("daemon already running at %s (pid %d)", net.JoinHostPort(state.Host, strconv.Itoa(state.Port)), state.PID)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("load daemon state: %w", err)
	}

	// ── Phase 2: TCP listener ──────────────────────────────────────────────
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
	daemonIDPath := filepath.Join(filepath.Dir(statePath), nodeid.FileName)
	daemonID, err := nodeid.EnsureDaemonID(daemonIDPath)
	if err != nil {
		return fmt.Errorf("ensure daemon id: %w", err)
	}
	currentPID := os.Getpid()

	// ── Phase 3: handler + auth + relay status ─────────────────────────────
	workspaceManager := workspace.NewManager()
	cleanupStore, err := newWorkspaceCleanupStore(statePath)
	if err != nil {
		return fmt.Errorf("create workspace cleanup store: %w", err)
	}
	configFilePath := filepath.Join(filepath.Dir(statePath), "credential.yaml")
	contextStore := NewAppContextStore(configFilePath)
	handler := NewJSONRPCHandler(workspaceManager, runtime, daemonID, cfg.LogFilePath, cleanupStore, statePath, contextStore)
	if handler.tokenUsage != nil {
		handler.tokenUsage.StartStartupScan()
	}
	relayStatus := NewRelayStatus(cfg.RelayEnabled, cfg.RelayURL)

	// ── Phase 4: HTTP server ───────────────────────────────────────────────
	mux := http.NewServeMux()
	mux.Handle("/ws", handler)
	mux.HandleFunc(agentHookIngestPath, handler.ServeAgentHook)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "running",
			"version":  buildinfo.Version,
			"daemonId": daemonID,
			"relay":    relayStatus.Snapshot(),
		})
	})
	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	defer cancelCleanup()
	handler.startWorkspaceCleanupRetry(cleanupCtx)

	// ── Phase 5: persist state + env setup + node registration + relay ─────
	if err := startDaemonServices(cfg, statePath, actualAddr, daemonID, currentPID, tcpAddr.Port, handler, relayStatus, runtime); err != nil {
		return err
	}
	defer func() {
		if err := RemoveState(statePath); err != nil {
			log.Warn().Err(err).Msg("failed to remove daemon state file")
		}
	}()

	// ── Phase 6: signal handling + serve ──────────────────────────────────
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(stop)

	shutdownCtx, cancelShutdown := context.WithCancel(context.Background())
	defer cancelShutdown()

	if cfg.RelayEnabled && cfg.RelayURL != "" {
		go runRelayClientLoop(shutdownCtx, handler.runtime, handler, daemonID, cfg.RelayURL, relayStatus)
	}

	go func() {
		<-stop
		cancelShutdown()
		handler.Shutdown()
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
	startLog.Str("address", actualAddr).Msg("daemon server started")
	err = server.Serve(listener)
	if err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("daemon server failed: %w", err)
	}

	log.Debug().Msg("daemon server stopped")
	return nil
}

// startDaemonServices handles the most complex startup phase: persisting daemon
// state, setting up the hook ingress env var, running managed agent runtime
// setup, registering the daemon as a remote node if API credentials are
// configured, and initialising the relay client goroutine.
func startDaemonServices(cfg RunConfig, statePath string, actualAddr string, daemonID string, currentPID int, actualPort int, handler *JSONRPCHandler, relayStatus *RelayStatus, runtime *cliruntime.Runtime) error {
	if err := SaveState(statePath, RuntimeState{
		PID:       currentPID,
		Host:      cfg.Host,
		Port:      actualPort,
		StartedAt: time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("save daemon state: %w", err)
	}
	_ = os.Setenv("YISHAN_HOOK_INGRESS_URL", "http://"+actualAddr+agentHookIngestPath)
	agentsetup.EnsureManagedAgentRuntime()

	if runtime != nil && runtime.APIConfigured() {
		agentDetectionStatus := listAgentDetectionStatuses(false)
		if err := registerRemoteNode(runtime, NodeRegistration{
			ID:                   daemonID,
			Endpoint:             "http://" + actualAddr,
			AgentDetectionStatus: agentDetectionStatus,
		}); err != nil {
			if isReauthRequiredError(err) {
				log.Warn().Err(err).Msg("daemon started without remote node registration; re-authentication required")
			} else {
				return fmt.Errorf("register daemon node: %w", err)
			}
		}
	}
	return nil
}
