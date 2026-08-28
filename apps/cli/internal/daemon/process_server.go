package daemon

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	agentsetup "yishan/apps/cli/internal/agent/setup"
	hook "yishan/apps/cli/internal/node/hook"
	nodesystem "yishan/apps/cli/internal/node/system"

	"github.com/rs/zerolog/log"
)

func saveDaemonState(cfg RunConfig, dr *daemonRuntime) error {
	if err := saveState(dr.statePath, RuntimeState{
		PID:       os.Getpid(),
		Host:      cfg.Host,
		Port:      dr.actualPort,
		StartedAt: time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("save daemon state: %w", err)
	}
	_ = os.Setenv("YISHAN_HOOK_INGRESS_URL", "http://"+dr.actualAddr+hook.AgentHookIngestPath)
	if usesRemoteHostPolicy(dr.app.Session) {
		_ = os.Setenv(agentsetup.RemoteHostPolicyEnvKey, "1")
	} else {
		_ = os.Unsetenv(agentsetup.RemoteHostPolicyEnvKey)
	}
	agentsetup.EnsureManagedAgentRuntime(usesRemoteHostPolicy(dr.app.Session))
	return nil
}

func startServing(cfg RunConfig, dr *daemonRuntime) (*shutdownContext, error) {
	if err := saveDaemonState(cfg, dr); err != nil {
		return nil, err
	}
	serverErr, serverStopped := serveDaemonHTTP(dr)
	stop := listenForShutdownSignals()
	relayCtx, cancelRelay := context.WithCancel(context.Background())
	processCtx, cancelProcess := context.WithCancel(context.Background())
	shutdownStarted := make(chan struct{})
	shutdownComplete := make(chan struct{})
	startRelay(cfg, dr, relayCtx)
	go handleShutdownSignal(stop, cancelRelay, processCtx, cancelProcess, dr.app, dr.server, serverStopped, shutdownStarted, shutdownComplete)
	logDaemonServerStart(dr.actualAddr)
	return &shutdownContext{
		processCtx: processCtx, cancelProcess: cancelProcess, cancelRelay: cancelRelay,
		stop: stop, shutdownStarted: shutdownStarted, shutdownComplete: shutdownComplete,
		serverStopped: serverStopped, serverErr: serverErr,
	}, nil
}

func serveDaemonHTTP(dr *daemonRuntime) (chan error, chan struct{}) {
	serverErr := make(chan error, 1)
	serverStopped := make(chan struct{})
	go func() {
		defer close(serverStopped)
		serverErr <- dr.server.Serve(dr.listener)
	}()
	return serverErr, serverStopped
}

func listenForShutdownSignals() chan os.Signal {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	// Ignore SIGHUP. opencode (Bun) calls setsid() when starting its TUI
	// inside a PTY session managed by the daemon. On macOS, this causes the
	// kernel to deliver SIGHUP to the process holding the PTY master fd (the
	// daemon). The default Go runtime action for an unhandled SIGHUP is to
	// terminate the process immediately, so we explicitly suppress it here.
	signal.Ignore(syscall.SIGHUP)
	return stop
}

func startRelay(cfg RunConfig, dr *daemonRuntime, relayCtx context.Context) {
	if cfg.RelayEnabled && cfg.RelayURL != "" {
		go dr.app.Relay().Run(relayCtx)
	}
}

func logDaemonServerStart(address string) {
	startLog := log.Info()
	if os.Getenv(detachedEnvKey) == "1" {
		startLog = log.Debug()
	}
	startLog.Str("address", address).Msg("daemon server started")
}

const (
	appCloseRetryDelay               = 100 * time.Millisecond
	appCloseProcessCancellationGrace = 30 * time.Second
)

type daemonAppCloser interface {
	Close() error
}

type daemonAppCloserFunc func() error

func (fn daemonAppCloserFunc) Close() error {
	return fn()
}

// closeAppForShutdown keeps the app's dependencies alive while retrying Close.
// Once processCtx is cancelled, retries have a 30-second grace period: this
// bounds termination when the OS has requested exit, while ordinary graceful
// shutdown waits until background jobs durably reach their terminal state.
func closeAppForShutdown(processCtx context.Context, closer daemonAppCloser) error {
	var cancellationTimer *time.Timer
	defer func() { stopTimer(cancellationTimer) }()
	for {
		if err := closer.Close(); err == nil {
			return nil
		} else {
			log.Warn().Err(err).Msg("app close incomplete; retrying before daemon shutdown")
			if cancellationTimer == nil && isContextCancelled(processCtx) {
				cancellationTimer = time.NewTimer(appCloseProcessCancellationGrace)
			}
			if err := waitForAppCloseRetry(cancellationTimer); err != nil {
				return fmt.Errorf("app close did not complete before process-cancellation grace period: %w", err)
			}
		}
	}
}

func stopTimer(timer *time.Timer) {
	if timer != nil {
		timer.Stop()
	}
}

func isContextCancelled(ctx context.Context) bool {
	return ctx != nil && ctx.Err() != nil
}

func waitForAppCloseRetry(cancellationTimer *time.Timer) error {
	retryTimer := time.NewTimer(appCloseRetryDelay)
	defer retryTimer.Stop()
	if cancellationTimer == nil {
		<-retryTimer.C
		return nil
	}
	select {
	case <-retryTimer.C:
		return nil
	case <-cancellationTimer.C:
		return context.Canceled
	}
}

func handleShutdownSignal(stop chan os.Signal, cancelRelay context.CancelFunc, processCtx context.Context, cancelProcess context.CancelFunc, application daemonAppCloser, server *http.Server, stopped <-chan struct{}, shutdownStarted chan<- struct{}, shutdownComplete chan<- struct{}) {
	<-stop
	close(shutdownStarted)
	cancelRelay()
	cancelProcess()
	if err := closeAppForShutdown(processCtx, application); err != nil {
		log.Error().Err(err).Msg("forcing daemon server shutdown before app cleanup completed")
	}
	shutdownServer(server)
	<-stopped
	close(shutdownComplete)
}

// closeAfterRegistrationFailure uses the same retrying app shutdown path as a signal.
// It preserves the registration error after background jobs are durably quiesced.
func closeAfterRegistrationFailure(sc *shutdownContext, application daemonAppCloser, server *http.Server, registrationErr error) error {
	sc.cancelRelay()
	if err := closeAppForShutdown(sc.processCtx, application); err != nil {
		log.Error().Err(err).Msg("app cleanup did not complete after node registration failure")
	}
	shutdownServer(server)
	<-sc.serverStopped
	return registrationErr
}

func registerNode(dr *daemonRuntime, runtime *session.Session) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	agentDetectionStatus := nodesystem.ListAgentDetectionStatuses(false)
	if err := registerRemoteNode(runtime, nodeRegistration{
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
	select {
	case <-sc.shutdownComplete:
		return sc.getServerError()
	case serverErr := <-sc.serverErr:
		select {
		case <-sc.shutdownStarted:
			<-sc.shutdownComplete
		default:
			// Route an unexpected Serve exit through the same coordinator as a
			// process signal so App.Close completes before Run returns.
			sc.stop <- syscall.SIGTERM
			<-sc.shutdownComplete
		}
		return getDaemonServerError(serverErr)
	}
}

func (sc *shutdownContext) getServerError() error {
	return getDaemonServerError(<-sc.serverErr)
}

func getDaemonServerError(serverErr error) error {
	if serverErr != nil && serverErr != http.ErrServerClosed {
		return fmt.Errorf("daemon server failed: %w", serverErr)
	}
	log.Debug().Msg("daemon server stopped")
	return nil
}
