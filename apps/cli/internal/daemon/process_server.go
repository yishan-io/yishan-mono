package daemon

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	agentsetup "yishan/apps/cli/internal/agentsetup"
	cliruntime "yishan/apps/cli/internal/runtime"

	"github.com/rs/zerolog/log"
)

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

func (sc *shutdownContext) waitForShutdown() error {
	<-sc.ctx.Done()

	if err := <-sc.serverErr; err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("daemon server failed: %w", err)
	}
	log.Debug().Msg("daemon server stopped")
	return nil
}
