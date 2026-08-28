package daemon

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/app"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/platform/logging"

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
	DSHEnabled            bool
	DSHNodePath           string
	DSHRuntimePath        string
	DSHProvider           string
	DSHModel              string
	// LogFilePath is the initial daemon log file path. Default log output starts
	// at the profile path and switches to the account path after user_id resolves.
	LogFilePath string
	// HasCustomLogFile keeps an explicit --log-file path unchanged for all phases.
	HasCustomLogFile bool
	// LogFileWriter receives the runtime path switch after account resolution.
	LogFileWriter *logging.FileWriter
}

// daemonRuntime holds the initialized state produced during daemon bootstrap
// (phases 1–4). It owns the TCP listener and must be cleaned up via
// closeListener() when the daemon exits. Service lifecycle (background tasks,
// database, shutdown order) is owned by the node app.
type daemonRuntime struct {
	listener    net.Listener
	actualAddr  string
	daemonID    string
	app         *app.App
	relayStatus *relay.Status
	server      *http.Server
	statePath   string
	actualPort  int
}

// shutdownContext holds the coordination channels produced when the daemon
// starts serving (phases 5–6).
type shutdownContext struct {
	processCtx       context.Context
	cancelProcess    context.CancelFunc
	cancelRelay      context.CancelFunc
	stop             chan os.Signal
	shutdownStarted  <-chan struct{}
	shutdownComplete <-chan struct{}
	serverStopped    <-chan struct{}
	serverErr        <-chan error
}

func usesRemoteHostPolicy(runtime *session.Session) bool {
	if runtime == nil {
		return false
	}
	return runtime.UsesServiceTokenAuth()
}

func buildMemorySummarizerConfig(cfg RunConfig, runtime *session.Session) memory.SummarizerConfig {
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
	sc.cancelRelay()
	sc.cancelProcess()
}

func Run(cfg RunConfig, statePath string, runtime *session.Session) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}

	// Enforce a single daemon per profile: hold the exclusive profile lock for
	// the lifetime of this process. If another live daemon holds it, refuse to
	// start instead of stacking a duplicate on the same profile.
	lock, err := acquireDaemonLock(lockFilePathForState(statePath))
	if err != nil {
		return err
	}
	defer lock.Release()

	dr, err := bootstrapDaemon(cfg, statePath, runtime)
	if err != nil {
		return err
	}
	defer dr.closeListener()

	sc, err := startServing(cfg, dr)
	if err != nil {
		return err
	}
	defer sc.cleanup()

	if err := registerNode(dr, runtime); err != nil {
		dr.app.Close()
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
