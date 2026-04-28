package cmd

import (
	"errors"
	"fmt"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/output"
)

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Manage workspace daemon service",
	Long:  "Manage the workspace daemon service that serves operations over WebSocket JSON-RPC.",
	Args:  cobra.NoArgs,
	RunE:  startDaemon,
}

var daemonStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start daemon in background",
	Args:  cobra.NoArgs,
	RunE:  startDaemon,
}

var daemonRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Run daemon in foreground",
	Args:  cobra.NoArgs,
	RunE:  runDaemon,
}

var daemonStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop running daemon",
	Args:  cobra.NoArgs,
	RunE:  stopDaemon,
}

var daemonRestartCmd = &cobra.Command{
	Use:   "restart",
	Short: "Restart daemon in background",
	Args:  cobra.NoArgs,
	RunE:  restartDaemon,
}

var daemonStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show daemon status",
	Args:  cobra.NoArgs,
	RunE:  statusDaemon,
}

func runDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	return daemon.Run(daemon.RunConfig{
		Host:         appConfig.Daemon.Host,
		Port:         appConfig.Daemon.Port,
		JWTSecret:    appConfig.Daemon.JWTSecret,
		JWTIssuer:    appConfig.Daemon.JWTIssuer,
		JWTAudience:  appConfig.Daemon.JWTAudience,
		JWTRequired:  appConfig.Daemon.JWTRequired,
		RegisterNode: buildDaemonNodeRegistrar(),
	}, statePath)
}

func startDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	state, err := daemon.LoadState(statePath)
	if err == nil {
		if daemon.IsProcessRunning(state.PID) {
			if daemon.IsHealthy(state, 250*time.Millisecond) {
				log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon already running")
				return nil
			}

			log.Warn().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon state exists but health check failed; removing stale state")
		}

		if err := daemon.RemoveState(statePath); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	if _, err := daemon.StartDetached(daemon.StartConfig{
		Run: daemon.RunConfig{
			Host:        appConfig.Daemon.Host,
			Port:        appConfig.Daemon.Port,
			JWTSecret:   appConfig.Daemon.JWTSecret,
			JWTIssuer:   appConfig.Daemon.JWTIssuer,
			JWTAudience: appConfig.Daemon.JWTAudience,
			JWTRequired: appConfig.Daemon.JWTRequired,
		},
		ConfigPath: appConfig.ConfigPath,
		LogLevel:   appConfig.LogLevel,
	}); err != nil {
		return err
	}

	state, err = daemon.WaitForReady(statePath, 5*time.Second)
	if err != nil {
		return err
	}

	log.Info().Int("pid", state.PID).Str("address", net.JoinHostPort(state.Host, strconv.Itoa(state.Port))).Msg("daemon started")
	return nil
}

func buildDaemonNodeRegistrar() func(daemon.NodeRegistration) error {
	if strings.TrimSpace(appConfig.API.Token) == "" || strings.TrimSpace(appConfig.API.BaseURL) == "" {
		return nil
	}

	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	return func(registration daemon.NodeRegistration) error {
		agentDetection := make([]map[string]any, 0, len(registration.AgentDetectionStatus))
		for _, status := range registration.AgentDetectionStatus {
			entry := map[string]any{
				"agentKind": status.AgentKind,
				"detected":  status.Detected,
			}
			if strings.TrimSpace(status.Version) != "" {
				entry["version"] = status.Version
			}
			agentDetection = append(agentDetection, entry)
		}

		_, err := apiClient().RegisterNode(api.RegisterNodeInput{
			NodeID:   registration.ID,
			Name:     hostname,
			Scope:    "private",
			Endpoint: registration.Endpoint,
			Metadata: map[string]any{
				"os":      runtime.GOOS,
				"version": buildinfo.Version,
				"agents":  agentDetection,
			},
		})
		if err != nil {
			return fmt.Errorf("register node %q: %w", registration.ID, err)
		}

		return nil
	}
}

func stopDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	state, err := daemon.Stop(statePath, 10*time.Second)
	if err != nil {
		if errors.Is(err, daemon.ErrNotRunning) {
			return errors.New("daemon is not running")
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

	state, err := daemon.Restart(
		daemon.StartConfig{
			Run: daemon.RunConfig{
				Host:        appConfig.Daemon.Host,
				Port:        appConfig.Daemon.Port,
				JWTSecret:   appConfig.Daemon.JWTSecret,
				JWTIssuer:   appConfig.Daemon.JWTIssuer,
				JWTAudience: appConfig.Daemon.JWTAudience,
				JWTRequired: appConfig.Daemon.JWTRequired,
			},
			ConfigPath: appConfig.ConfigPath,
			LogLevel:   appConfig.LogLevel,
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

func statusDaemon(_ *cobra.Command, _ []string) error {
	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return err
	}

	state, err := daemon.LoadState(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return output.PrintRenderData(output.RenderData{
				Title:   "daemon",
				Columns: []string{"running", "statePath"},
				Rows: []map[string]any{{
					"running":   false,
					"statePath": statePath,
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
			Columns: []string{"running", "pid", "statePath"},
			Rows: []map[string]any{{
				"running":   false,
				"pid":       state.PID,
				"statePath": statePath,
			}},
		})
	}

	return output.PrintRenderData(output.RenderData{
		Title:   "daemon",
		Columns: []string{"running", "pid", "address", "startedAt", "uptime", "statePath"},
		Rows: []map[string]any{{
			"running":   true,
			"pid":       state.PID,
			"address":   net.JoinHostPort(state.Host, strconv.Itoa(state.Port)),
			"startedAt": state.StartedAt.UTC().Format(time.RFC3339),
			"uptime":    time.Since(state.StartedAt).Round(time.Second).String(),
			"statePath": statePath,
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
	daemonCmd.PersistentFlags().String("jwt-secret", "", "JWT HMAC secret for daemon access")
	daemonCmd.PersistentFlags().String("jwt-issuer", "", "required JWT issuer")
	daemonCmd.PersistentFlags().String("jwt-audience", "", "required JWT audience")
	daemonCmd.PersistentFlags().Bool("jwt-required", true, "require JWT token for /ws access")

	cobra.CheckErr(viper.BindPFlag("daemon_host", daemonCmd.PersistentFlags().Lookup("host")))
	cobra.CheckErr(viper.BindPFlag("daemon_port", daemonCmd.PersistentFlags().Lookup("port")))
	cobra.CheckErr(viper.BindPFlag("daemon_jwt_secret", daemonCmd.PersistentFlags().Lookup("jwt-secret")))
	cobra.CheckErr(viper.BindPFlag("daemon_jwt_issuer", daemonCmd.PersistentFlags().Lookup("jwt-issuer")))
	cobra.CheckErr(viper.BindPFlag("daemon_jwt_audience", daemonCmd.PersistentFlags().Lookup("jwt-audience")))
	cobra.CheckErr(viper.BindPFlag("daemon_jwt_required", daemonCmd.PersistentFlags().Lookup("jwt-required")))
}
