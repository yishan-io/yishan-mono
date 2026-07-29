package daemon

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/computer"
	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/nodeid"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
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

	handler, relayStatus, database, err := buildHandler(cfg, statePath, runtime, daemonID)
	if err != nil {
		_ = listener.Close() // listener is not owned by a daemon runtime yet
		return nil, err
	}

	server := buildHTTPServer(handler, daemonID, relayStatus)
	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	handler.startWorkspaceCleanupRetry(cleanupCtx)

	return &daemonRuntime{
		listener:      listener,
		actualAddr:    actualAddr,
		actualPort:    actualPort,
		daemonID:      daemonID,
		handler:       handler,
		relayStatus:   relayStatus,
		server:        server,
		statePath:     statePath,
		localDatabase: database,

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

func buildHandler(cfg RunConfig, statePath string, runtime *cliruntime.Runtime, daemonID string) (*JSONRPCHandler, *RelayStatus, *sql.DB, error) {
	database, err := initLocalDatabase(statePath)
	if err != nil {
		return nil, nil, nil, err
	}
	workspaceManager := workspace.NewManagerWithStore(localdb.NewWorkspaceStore(database))
	cleanupStore, err := newWorkspaceCleanupStore(statePath)
	if err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, nil, fmt.Errorf("create workspace cleanup store: %w", err)
	}
	settingsFilePath := config.SettingsFilePath(filepath.Dir(statePath))
	contextStore := NewAppContextStore(settingsFilePath)
	wsIndexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, nil, fmt.Errorf("create workspace index store: %w", err)
	}
	handler := NewJSONRPCHandler(workspaceManager, runtime, daemonID, cfg.LogFilePath, cleanupStore, wsIndexStore, statePath, contextStore)
	handler.SetLocalDatabase(database)
	handler.SetComputerService(newDefaultComputerService())
	if err := initComputerConfig(handler); err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, nil, err
	}

	if err := initMemoryService(handler, statePath, cfg, runtime); err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, nil, err
	}
	if err := workspaceManager.HydrateFromDB(context.Background()); err != nil {
		_ = database.Close() // cleanup after failed daemon bootstrap
		return nil, nil, nil, fmt.Errorf("restore persisted workspaces: %w", err)
	}
	if handler.tokenUsage != nil {
		handler.tokenUsage.StartStartupScan()
	}

	relayStatus := NewRelayStatus(cfg.RelayEnabled, cfg.RelayURL)
	return handler, relayStatus, database, nil
}

func initLocalDatabase(statePath string) (*sql.DB, error) {
	database, err := localdb.Open(filepath.Dir(statePath))
	if err != nil {
		return nil, fmt.Errorf("open local database: %w", err)
	}
	if err := localdb.Migrate(database); err != nil {
		_ = database.Close() // cleanup after failed migration
		return nil, fmt.Errorf("migrate local database: %w", err)
	}
	return database, nil
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
