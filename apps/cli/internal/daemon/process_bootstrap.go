package daemon

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/node"
	"yishan/apps/cli/internal/nodeid"
	cliruntime "yishan/apps/cli/internal/runtime"
)

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
		_ = listener.Close() // listener is not owned by a daemon runtime yet
		return nil, err
	}

	// Resolve (and backfill) the active account before the account data dir is
	// derived, so db/memory/settings open under accounts/<userId>/. A running
	// daemon only re-resolves on restart; token syncs update credential.yaml
	// but open handles stay on the boot-time account.
	ensureUserIDForAccountResolution(runtime, filepath.Join(filepath.Dir(statePath), "credential.yaml"))

	handler, relayStatus, err := buildHandler(cfg, statePath, runtime, daemonID)
	if err != nil {
		_ = listener.Close() // listener is not owned by a daemon runtime yet
		return nil, err
	}

	server := buildHTTPServer(handler, daemonID, relayStatus)

	return &daemonRuntime{
		listener:    listener,
		actualAddr:  actualAddr,
		actualPort:  actualPort,
		daemonID:    daemonID,
		handler:     handler,
		app:         handler.nodeApp,
		relayStatus: relayStatus,
		server:      server,
		statePath:   statePath,
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

// buildHandler composes the account-scoped service graph (node.Bootstrap) and
// wires the JSON-RPC transport around it. envDir stays env-root scoped (e.g.
// the token-usage pricing cache); dataDir is the per-account data dir.
func buildHandler(cfg RunConfig, statePath string, runtime *cliruntime.Runtime, daemonID string) (*JSONRPCHandler, *RelayStatus, error) {
	envDir := filepath.Dir(statePath)
	credentialPath := filepath.Join(envDir, "credential.yaml")
	dataDir, err := config.ResolveAccountDataDir(credentialPath)
	if err != nil {
		return nil, nil, err
	}

	database, err := initLocalDatabase(envDir, dataDir)
	if err != nil {
		return nil, nil, err
	}

	app, err := node.Bootstrap(node.Config{
		Runtime:          runtime,
		NodeID:           daemonID,
		LogFilePath:      cfg.LogFilePath,
		Database:         database,
		EnvDir:           envDir,
		DataDir:          dataDir,
		SettingsPath:     config.SettingsFilePath(dataDir),
		MemorySummarizer: buildMemorySummarizerConfig(cfg, runtime),
	})
	if err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, err
	}
	handler := NewJSONRPCHandler(app)

	relayStatus := NewRelayStatus(cfg.RelayEnabled, cfg.RelayURL)
	return handler, relayStatus, nil
}

func initLocalDatabase(envDir string, dataDir string) (*sql.DB, error) {
	// Migrate legacy env-root data into the account dir before opening, so the
	// database handle reflects the account-scoped layout from the start.
	if err := migrateAccountLayout(envDir, dataDir); err != nil {
		return nil, fmt.Errorf("migrate account data layout: %w", err)
	}
	database, err := localdb.Open(dataDir)
	if err != nil {
		return nil, fmt.Errorf("open local database: %w", err)
	}
	if err := localdb.Migrate(database); err != nil {
		_ = database.Close() // cleanup after failed migration
		return nil, fmt.Errorf("migrate local database: %w", err)
	}
	if err := localdb.CleanupLegacyProfileFiles(dataDir); err != nil {
		_ = database.Close() // cleanup after failed legacy-file cleanup
		return nil, fmt.Errorf("clean up legacy profile files: %w", err)
	}
	return database, nil
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
