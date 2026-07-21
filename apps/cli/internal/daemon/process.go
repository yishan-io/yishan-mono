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

	"yishan/apps/cli/internal/memory"
	cliruntime "yishan/apps/cli/internal/runtime"

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
