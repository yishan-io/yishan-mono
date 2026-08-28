package cmd

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/daemon"
	daemonclient "yishan/apps/cli/internal/daemon/client"
	"yishan/apps/cli/internal/platform/config"
)

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Manage workspace daemon service",
	Long:  `Manage the workspace daemon service that serves operations over WebSocket JSON-RPC.`,
}

var daemonStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start daemon in background",
	Long: `Start the daemon process in the background.

Idempotent — if a healthy daemon is already running this command exits
successfully without starting a second instance. If a stale state file is
found (process no longer alive) it is removed and a fresh daemon is started.`,
	Example: `  yishan daemon start`,
	Args:    cobra.NoArgs,
	RunE:    startDaemon,
}

var daemonRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Run daemon in foreground",
	Long: `Run the daemon in the foreground. Useful for debugging — logs go directly
to the terminal and the process exits when you press Ctrl-C.`,
	Example: `  yishan daemon run
  yishan daemon run --log-level debug`,
	Args: cobra.NoArgs,
	RunE: runDaemon,
}

var daemonStopCmd = &cobra.Command{
	Use:     "stop",
	Short:   "Stop running daemon",
	Long:    `Send a shutdown signal to the running daemon and wait for it to exit.`,
	Example: `  yishan daemon stop`,
	Args:    cobra.NoArgs,
	RunE:    stopDaemon,
}

var daemonRestartCmd = &cobra.Command{
	Use:     "restart",
	Short:   "Restart daemon in background",
	Long:    `Stop the running daemon (if any) and start a fresh one in the background.`,
	Example: `  yishan daemon restart`,
	Args:    cobra.NoArgs,
	RunE:    restartDaemon,
}

var daemonStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show daemon status",
	Long:  `Show whether the daemon is running and, if so, its PID, listen address, start time, and uptime.`,
	Example: `  yishan daemon status
  yishan daemon status --output json`,
	Args: cobra.NoArgs,
	RunE: statusDaemon,
}

func runDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	logFile, hasCustomLogFile, err := resolveLogFilePath()
	if err != nil {
		return err
	}

	if err := configureDaemonLogFile(logFile); err != nil {
		return fmt.Errorf("configure daemon log file: %w", err)
	}
	defer closeDaemonLogFile()

	log.Info().Str("log_file", logFile).Msg("daemon log file configured")

	return daemon.Run(buildRunConfig(logFile, hasCustomLogFile), statePath, apiClientSession())
}

func startDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	logFile, hasCustomLogFile, err := resolveLogFilePath()
	if err != nil {
		return err
	}

	state, err := daemon.StartDaemon(daemon.StartConfig{
		Run:              buildRunConfig("", false),
		ConfigPath:       appConfig.ConfigPath,
		LogLevel:         appConfig.LogLevel,
		LogFile:          logFile,
		HasCustomLogFile: hasCustomLogFile,
	}, statePath)
	if err != nil {
		return err
	}

	log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Str("log_file", logFile).Msg("daemon running")
	return nil
}

func stopDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	state, err := daemon.Stop(statePath, 10*time.Second)
	if err != nil {
		if errors.Is(err, daemon.ErrNotRunning) {
			return nil
		}
		return err
	}

	log.Info().Int("pid", state.PID).Msg("daemon stopped")
	return nil

}

func restartDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	logFile, hasCustomLogFile, err := resolveLogFilePath()
	if err != nil {
		return err
	}

	state, err := daemon.Restart(
		daemon.StartConfig{
			Run:              buildRunConfig("", false),
			ConfigPath:       appConfig.ConfigPath,
			LogLevel:         appConfig.LogLevel,
			LogFile:          logFile,
			HasCustomLogFile: hasCustomLogFile,
		},
		statePath,
		10*time.Second,
		5*time.Second,
	)
	if err != nil {
		return err
	}

	log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon restarted")
	return nil

}

// buildRunConfig assembles a daemon.RunConfig from the current appConfig.
// logFilePath is only meaningful when running in the foreground (daemon run);
// pass an empty string when building a config for StartDetached.
func buildRunConfig(logFilePath string, hasCustomLogFile ...bool) daemon.RunConfig {
	isCustomLogFile := len(hasCustomLogFile) > 0 && hasCustomLogFile[0]
	return daemon.RunConfig{
		Host:                  appConfig.Daemon.Host,
		Port:                  appConfig.Daemon.Port,
		RelayEnabled:          appConfig.Daemon.RelayEnabled,
		RelayURL:              appConfig.Daemon.RelayURL,
		RelayToken:            appConfig.Daemon.RelayToken,
		MemorySummarizer:      appConfig.Memory.SummarizerEnabled,
		MemorySummarizerAgent: appConfig.Memory.SummarizerAgentKind,
		MemorySummarizerModel: appConfig.Memory.SummarizerModel,
		DSHEnabled:            appConfig.Daemon.DSHEnabled,
		DSHNodePath:           appConfig.Daemon.DSHNodePath,
		DSHRuntimePath:        appConfig.Daemon.DSHRuntimePath,
		DSHProvider:           appConfig.Daemon.DSHProvider,
		DSHModel:              appConfig.Daemon.DSHModel,
		LogFilePath:           logFilePath,
		HasCustomLogFile:      isCustomLogFile,
		LogFileWriter:         activeLogFileWriter,
	}
}

// resolveLogFilePath returns the daemon log file path from the --log-file flag
// or falls back to the profile-default path.
func resolveLogFilePath() (string, bool, error) {
	if logFile := viper.GetString("daemon_log_file"); logFile != "" {
		return logFile, true, nil
	}
	logFile, err := daemon.ResolveLogFilePath(appConfig.ConfigPath)
	return logFile, false, err
}

func statusDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	lockPath, err := daemon.ResolveLockFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	logFile, _, _ := resolveLogFilePath()

	state, err := daemon.LoadState(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return output.PrintRenderData(output.RenderData{
				Title:   "daemon",
				Columns: []string{"running", "statePath", "logFile"},
				Rows: []map[string]any{{
					"running":   false,
					"statePath": statePath,
					"logFile":   logFile,
				}},
			})
		}
		return err
	}

	if !daemon.IsProcessRunning(state.PID) {
		if removeErr := daemon.RemoveState(statePath); removeErr != nil {
			log.Warn().Err(removeErr).Str("state_path", statePath).Msg("failed to remove stale daemon state file")
		}

		return output.PrintRenderData(output.RenderData{
			Title:   "daemon",
			Columns: []string{"running", "pid", "statePath", "logFile"},
			Rows: []map[string]any{{
				"running":   false,
				"pid":       state.PID,
				"statePath": statePath,
				"logFile":   logFile,
			}},
		})
	}

	return output.PrintRenderData(output.RenderData{
		Title:   "daemon",
		Columns: []string{"running", "pid", "address", "startedAt", "uptime", "lockPath", "lockHolderPID", "statePath", "logFile"},
		Rows: []map[string]any{{
			"running":       true,
			"pid":           state.PID,
			"address":       net.JoinHostPort(state.Host, strconv.Itoa(state.Port)),
			"startedAt":     state.StartedAt.UTC().Format(time.RFC3339),
			"uptime":        time.Since(state.StartedAt).Round(time.Second).String(),
			"lockPath":      lockPath,
			"lockHolderPID": daemon.LockHolderPID(lockPath),
			"statePath":     statePath,
			"logFile":       logFile,
		}},
	})
}

func init() {
	rootCmd.AddCommand(daemonCmd)
	daemonCmd.AddCommand(daemonStartCmd)
	daemonCmd.AddCommand(daemonRunCmd)
	daemonCmd.AddCommand(daemonStopCmd)
	daemonCmd.AddCommand(daemonRestartCmd)
	daemonCmd.AddCommand(daemonStatusCmd)

	daemonCmd.PersistentFlags().String("host", "127.0.0.1", "daemon listen host")
	daemonCmd.PersistentFlags().Int("port", 0, "daemon listen port (0 = random)")
	daemonCmd.PersistentFlags().Bool("relay-enabled", true, "connect daemon to relay over outbound websocket")
	daemonCmd.PersistentFlags().String("relay-url", "https://relay.yishan.io", "relay websocket URL (wss://.../ws)")
	daemonCmd.PersistentFlags().String("relay-token", "", "static relay JWT for local dev (bypasses API token minting)")
	daemonCmd.PersistentFlags().String("log-file", "", "daemon log file path (default: ~/.yishan/profiles/<profile>/logs/system.log)")
	daemonCmd.PersistentFlags().Bool("dsh-enabled", false, "enable the experimental bundled DSH runtime")
	daemonCmd.PersistentFlags().String("dsh-node-path", "", "bundled Electron executable path for DSH")
	daemonCmd.PersistentFlags().String("dsh-runtime-path", "", "bundled DSH JavaScript runtime path")
	daemonCmd.PersistentFlags().String("dsh-provider", config.DefaultDSHProvider, "DSH provider default")
	daemonCmd.PersistentFlags().String("dsh-model", config.DefaultDSHModel, "DSH model default")

	cobra.CheckErr(viper.BindPFlag("daemon_host", daemonCmd.PersistentFlags().Lookup("host")))
	cobra.CheckErr(viper.BindPFlag("daemon_port", daemonCmd.PersistentFlags().Lookup("port")))
	cobra.CheckErr(viper.BindPFlag("daemon_relay_enabled", daemonCmd.PersistentFlags().Lookup("relay-enabled")))
	cobra.CheckErr(viper.BindPFlag("daemon_relay_url", daemonCmd.PersistentFlags().Lookup("relay-url")))
	cobra.CheckErr(viper.BindPFlag("daemon_relay_token", daemonCmd.PersistentFlags().Lookup("relay-token")))
	cobra.CheckErr(viper.BindPFlag("daemon_log_file", daemonCmd.PersistentFlags().Lookup("log-file")))
	cobra.CheckErr(viper.BindPFlag("daemon_dsh_enabled", daemonCmd.PersistentFlags().Lookup("dsh-enabled")))
	cobra.CheckErr(viper.BindPFlag("daemon_dsh_node_path", daemonCmd.PersistentFlags().Lookup("dsh-node-path")))
	cobra.CheckErr(viper.BindPFlag("daemon_dsh_runtime_path", daemonCmd.PersistentFlags().Lookup("dsh-runtime-path")))
	cobra.CheckErr(viper.BindPFlag("daemon_dsh_provider", daemonCmd.PersistentFlags().Lookup("dsh-provider")))
	cobra.CheckErr(viper.BindPFlag("daemon_dsh_model", daemonCmd.PersistentFlags().Lookup("dsh-model")))
}

// resolveDaemonClient loads the daemon state file and returns a JSON-RPC
// client pointed at the running daemon. Returns daemon.ErrNotRunning if no
// healthy daemon process is found, which maps to exit code 6.
func resolveDaemonClient() (*daemonclient.Client, error) {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return nil, err
	}

	state, err := daemon.LoadState(statePath)
	if err != nil {
		return nil, daemon.ErrNotRunning
	}

	if !daemon.IsProcessRunning(state.PID) {
		return nil, daemon.ErrNotRunning
	}

	wsURL := "ws://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port)) + "/ws"
	return daemonclient.New(wsURL, ""), nil
}
