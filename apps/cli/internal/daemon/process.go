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

	agentsetup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/nodeid"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

var ErrNotRunning = errors.New("daemon is not running")

const detachedEnvKey = "YISHAN_DAEMON_DETACHED"

type RunConfig struct {
	Host                  string
	Port                  int
	RelayEnabled          bool
	RelayURL              string
	RelayToken            string // static JWT for local dev; bypasses API token minting
	MemorySummarizer      bool
	MemorySummarizerAgent string
	MemorySummarizerModel string
	// LogFilePath is the resolved path to the daemon log file.
	// Set by the command layer; passed through to handlers for diagnostics.
	LogFilePath string
}

// daemonRuntime holds the initialized state produced during daemon bootstrap
// (phases 1–4). It owns the TCP listener and must be cleaned up via
// closeListener() when the daemon exits.
type daemonRuntime struct {
	listener    net.Listener
	actualAddr  string
	daemonID    string
	handler     *JSONRPCHandler
	relayStatus *RelayStatus
	server      *http.Server
	statePath   string
	actualPort  int

	cleanupCtxCancel context.CancelFunc
}

// shutdownContext holds the coordination channels produced when the daemon
// starts serving (phases 5–6).
type shutdownContext struct {
	ctx       context.Context
	cancel    context.CancelFunc
	stop      chan os.Signal
	serverErr <-chan error
}

func usesRemoteHostPolicy(runtime *cliruntime.Runtime) bool {
	if runtime == nil {
		return false
	}
	return runtime.UsesServiceTokenAuth()
}

func buildMemorySummarizerConfig(cfg RunConfig, runtime *cliruntime.Runtime) memory.SummarizerConfig {
	memoryCfg := memory.SummarizerConfig{
		Enabled:   cfg.MemorySummarizer,
		AgentKind: cfg.MemorySummarizerAgent,
		Model:     cfg.MemorySummarizerModel,
	}
	if usesRemoteHostPolicy(runtime) {
		memoryCfg.DisableProjectMemory = true
		memoryCfg.DisablePersona = true
	}
	return memoryCfg
}

func (sc *shutdownContext) cleanup() {
	signal.Stop(sc.stop)
	sc.cancel()
}

func Run(cfg RunConfig, statePath string, runtime *cliruntime.Runtime) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}

	dr, err := bootstrapDaemon(cfg, statePath, runtime)
	if err != nil {
		return err
	}
	defer dr.closeListener()
	defer dr.cleanupCtxCancel()
	defer func() {
		if err := RemoveState(statePath); err != nil {
			log.Warn().Err(err).Msg("failed to remove daemon state file")
		}
	}()

	sc, err := startServing(cfg, dr)
	if err != nil {
		return err
	}
	defer sc.cleanup()

	if err := registerNode(dr, runtime); err != nil {
		shutdownServer(dr.server)
		return err
	}

	return sc.waitForShutdown()
}

func (dr *daemonRuntime) closeListener() {
	if closeErr := dr.listener.Close(); closeErr != nil {
		if errors.Is(closeErr, net.ErrClosed) {
			return
		}
		log.Warn().Err(closeErr).Msg("failed to close daemon listener")
	}
}

func shutdownServer(server *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("failed to shutdown daemon server after startup error")
	}
}

// ── bootstrapDaemon (phases 1–4) ────────────────────────────────────────────

func bootstrapDaemon(cfg RunConfig, statePath string, runtime *cliruntime.Runtime) (*daemonRuntime, error) {
	if err := checkNotAlreadyRunning(statePath); err != nil {
		return nil, err
	}

	listener, actualAddr, actualPort, err := bindListener(cfg)
	if err != nil {
		return nil, err
	}

	daemonID, err := resolveDaemonID(statePath)
	if err != nil {
		return nil, err
	}

	handler, relayStatus, err := buildHandler(cfg, statePath, runtime, daemonID)
	if err != nil {
		return nil, err
	}

	server := buildHTTPServer(handler, daemonID, relayStatus)
	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	handler.startWorkspaceCleanupRetry(cleanupCtx)

	return &daemonRuntime{
		listener:    listener,
		actualAddr:  actualAddr,
		actualPort:  actualPort,
		daemonID:    daemonID,
		handler:     handler,
		relayStatus: relayStatus,
		server:      server,
		statePath:   statePath,

		cleanupCtxCancel: cancelCleanup,
	}, nil
}

func checkNotAlreadyRunning(statePath string) error {
	state, err := LoadState(statePath)
	if err == nil {
		return fmt.Errorf("daemon already running at %s (pid %d)",
			net.JoinHostPort(state.Host, strconv.Itoa(state.Port)), state.PID)
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("load daemon state: %w", err)
	}
	return nil
}

func bindListener(cfg RunConfig) (net.Listener, string, int, error) {
	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)))
	if err != nil {
		return nil, "", 0, fmt.Errorf("listen daemon server: %w", err)
	}
	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		listener.Close()
		return nil, "", 0, fmt.Errorf("unexpected listener address type %T", listener.Addr())
	}
	return listener, net.JoinHostPort(cfg.Host, strconv.Itoa(tcpAddr.Port)), tcpAddr.Port, nil
}

func resolveDaemonID(statePath string) (string, error) {
	daemonIDPath := filepath.Join(filepath.Dir(statePath), nodeid.FileName)
	daemonID, err := nodeid.EnsureDaemonID(daemonIDPath)
	if err != nil {
		return "", fmt.Errorf("ensure daemon id: %w", err)
	}
	return daemonID, nil
}

func buildHandler(cfg RunConfig, statePath string, runtime *cliruntime.Runtime, daemonID string) (*JSONRPCHandler, *RelayStatus, error) {
	workspaceManager := workspace.NewManager()
	cleanupStore, err := newWorkspaceCleanupStore(statePath)
	if err != nil {
		return nil, nil, fmt.Errorf("create workspace cleanup store: %w", err)
	}
	settingsFilePath := config.SettingsFilePath(filepath.Dir(statePath))
	contextStore := NewAppContextStore(settingsFilePath)
	wsIndexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		return nil, nil, fmt.Errorf("create workspace index store: %w", err)
	}
	handler := NewJSONRPCHandler(workspaceManager, runtime, daemonID, cfg.LogFilePath, cleanupStore, wsIndexStore, statePath, contextStore)
	handler.SetComputerService(newDefaultComputerService())
	if err := initComputerConfig(handler); err != nil {
		return nil, nil, err
	}

	if err := initMemoryService(handler, statePath, cfg, runtime); err != nil {
		return nil, nil, err
	}
	if err := restoreIndexedWorkspaces(handler); err != nil {
		return nil, nil, fmt.Errorf("restore indexed workspaces: %w", err)
	}
	if handler.tokenUsage != nil {
		handler.tokenUsage.StartStartupScan()
	}

	relayStatus := NewRelayStatus(cfg.RelayEnabled, cfg.RelayURL)
	return handler, relayStatus, nil
}

func initComputerConfig(handler *JSONRPCHandler) error {
	if handler.settingsPath == "" || handler.computer == nil {
		return nil
	}
	cfg, err := config.LoadSettings(handler.settingsPath, nil)
	if err != nil {
		return fmt.Errorf("load computer settings: %w", err)
	}
	handler.computer.UpdateConfig(computer.FeatureConfig{
		Enabled:            cfg.ComputerUse.Enabled,
		Observe:            cfg.ComputerUse.Observe,
		Capture:            cfg.ComputerUse.Capture,
		Inspect:            cfg.ComputerUse.Inspect,
		Actions:            cfg.ComputerUse.Actions,
		Mouse:              cfg.ComputerUse.Mouse,
		Keyboard:           cfg.ComputerUse.Keyboard,
		ClipboardRead:      cfg.ComputerUse.ClipboardRead,
		ClipboardWrite:     cfg.ComputerUse.ClipboardWrite,
		ApplicationControl: cfg.ComputerUse.ApplicationControl,
	})
	return nil
}

func initMemoryService(handler *JSONRPCHandler, statePath string, cfg RunConfig, runtime *cliruntime.Runtime) error {
	dir := filepath.Dir(statePath)
	oldPath := filepath.Join(dir, "memory.db")
	newPath := filepath.Join(dir, "memory", "memory.db")

	if _, err := os.Stat(oldPath); err == nil {
		if _, err := os.Stat(newPath); os.IsNotExist(err) {
			if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
				log.Warn().Err(err).Msg("failed to create memory directory for migration")
			} else if err := os.Rename(oldPath, newPath); err != nil {
				log.Warn().Err(err).Str("from", oldPath).Str("to", newPath).Msg("failed to migrate memory.db")
			} else {
				log.Info().Str("from", oldPath).Str("to", newPath).Msg("migrated memory.db to memory/ directory")
			}
		}
	}

	memSvc, memErr := memory.NewService(newPath, buildMemorySummarizerConfig(cfg, runtime), buildRunAgentFunc())
	if memErr != nil {
		log.Warn().Err(memErr).Msg("memory service initialization failed, memory features disabled")
		return nil
	}
	handler.SetMemoryService(memSvc, context.Background())
	return nil
}

func buildHTTPServer(handler *JSONRPCHandler, daemonID string, relayStatus *RelayStatus) *http.Server {
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
	return &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
}

// ── startServing (phases 5–6) ───────────────────────────────────────────────

func saveDaemonState(cfg RunConfig, dr *daemonRuntime) error {
	if err := SaveState(dr.statePath, RuntimeState{
		PID:       os.Getpid(),
		Host:      cfg.Host,
		Port:      dr.actualPort,
		StartedAt: time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("save daemon state: %w", err)
	}
	_ = os.Setenv("YISHAN_HOOK_INGRESS_URL", "http://"+dr.actualAddr+agentHookIngestPath)
	if usesRemoteHostPolicy(dr.handler.runtime) {
		_ = os.Setenv(agentsetup.RemoteHostPolicyEnvKey, "1")
	} else {
		_ = os.Unsetenv(agentsetup.RemoteHostPolicyEnvKey)
	}
	agentsetup.EnsureManagedAgentRuntime(usesRemoteHostPolicy(dr.handler.runtime))
	return nil
}

func startServing(cfg RunConfig, dr *daemonRuntime) (*shutdownContext, error) {
	if err := saveDaemonState(cfg, dr); err != nil {
		return nil, err
	}

	serverErr := make(chan error, 1)
	go func() { serverErr <- dr.server.Serve(dr.listener) }()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	// Ignore SIGHUP. opencode (Bun) calls setsid() when starting its TUI
	// inside a PTY session managed by the daemon. On macOS, this causes the
	// kernel to deliver SIGHUP to the process holding the PTY master fd (the
	// daemon). The default Go runtime action for an unhandled SIGHUP is to
	// terminate the process immediately, so we explicitly suppress it here.
	signal.Ignore(syscall.SIGHUP)

	shutdownCtx, cancelShutdown := context.WithCancel(context.Background())

	if cfg.RelayEnabled && cfg.RelayURL != "" {
		go runRelayClientLoop(shutdownCtx, dr.handler.runtime, dr.handler, dr.daemonID, cfg.RelayURL, cfg.RelayToken, dr.relayStatus)
	}

	go handleShutdownSignal(stop, cancelShutdown, dr.handler, dr.server)

	startLog := log.Info()
	if os.Getenv(detachedEnvKey) == "1" {
		startLog = log.Debug()
	}
	startLog.Str("address", dr.actualAddr).Msg("daemon server started")

	return &shutdownContext{ctx: shutdownCtx, cancel: cancelShutdown, stop: stop, serverErr: serverErr}, nil
}

func handleShutdownSignal(stop chan os.Signal, cancelShutdown context.CancelFunc, handler *JSONRPCHandler, server *http.Server) {
	<-stop
	cancelShutdown()
	handler.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("failed to shutdown daemon server")
	}
}

// ── registerNode (phase 7) ──────────────────────────────────────────────────

func registerNode(dr *daemonRuntime, runtime *cliruntime.Runtime) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	agentDetectionStatus := listAgentDetectionStatuses(false)
	if err := registerRemoteNode(runtime, NodeRegistration{
		ID:                   dr.daemonID,
		Endpoint:             "http://" + dr.actualAddr,
		AgentDetectionStatus: agentDetectionStatus,
	}); err != nil {
		if isReauthRequiredError(err) {
			log.Warn().Err(err).Msg("daemon started without remote node registration; re-authentication required")
			return nil
		}
		return fmt.Errorf("register daemon node: %w", err)
	}
	return nil
}

// ── waitForShutdown (phase 8) ───────────────────────────────────────────────

func (sc *shutdownContext) waitForShutdown() error {
	<-sc.ctx.Done()

	if err := <-sc.serverErr; err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("daemon server failed: %w", err)
	}
	log.Debug().Msg("daemon server stopped")
	return nil
}
