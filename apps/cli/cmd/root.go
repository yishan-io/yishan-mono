package cmd

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/logx"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cfgFile string
var appConfig config.Config

var rootCmd = &cobra.Command{
	Use:   "yishan",
	Short: "Yishan CLI",
	Long:  "Yishan CLI is a command-line tool for local developer workflows.",
	RunE: func(_ *cobra.Command, _ []string) error {
		log.Debug().Str("log_level", log.Logger.GetLevel().String()).Msg("yishan CLI is running")
		return nil
	},
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.yishan/profiles/<profile>/credential.yaml)")
	rootCmd.PersistentFlags().String("profile", "default", "runtime profile name (default, dev, ...)")
	rootCmd.PersistentFlags().String("log-level", "", "log level (debug, info, warn, error)")
	rootCmd.PersistentFlags().String("log-format", "", "log format (pretty, json)")
	rootCmd.PersistentFlags().StringP("output", "o", "default", "output format (default, json)")
	rootCmd.PersistentFlags().String("api-base-url", "https://api.yishan.io", "API service base URL")
	rootCmd.PersistentFlags().String("api-token", "", "API access token (Bearer)")
	cobra.CheckErr(viper.BindPFlag("profile", rootCmd.PersistentFlags().Lookup("profile")))
	cobra.CheckErr(viper.BindPFlag("log_level", rootCmd.PersistentFlags().Lookup("log-level")))
	cobra.CheckErr(viper.BindPFlag("log_format", rootCmd.PersistentFlags().Lookup("log-format")))
	cobra.CheckErr(viper.BindPFlag("output", rootCmd.PersistentFlags().Lookup("output")))
	cobra.CheckErr(viper.BindPFlag("api_base_url", rootCmd.PersistentFlags().Lookup("api-base-url")))
	cobra.CheckErr(viper.BindPFlag("api_token", rootCmd.PersistentFlags().Lookup("api-token")))
}

func initConfig() {
	viper.SetEnvPrefix("YISHAN")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()
	viper.SetDefault("profile", "default")
	viper.SetDefault("log_level", "info")
	viper.SetDefault("log_format", logx.FormatPretty)
	viper.SetDefault("output", "default")
	viper.SetDefault("daemon_relay_enabled", true)
	viper.SetDefault("daemon_relay_url", "https://relay.yishan.io")

	if err := configureLogger(viper.GetString("log_level"), viper.GetString("log_format")); err != nil {
		cobra.CheckErr(err)
	}

	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		resolvedConfigPath, err := config.ResolveConfigPath(viper.GetViper(), cfgFile)
		cobra.CheckErr(err)
		viper.SetConfigFile(resolvedConfigPath)
	}

	if err := viper.ReadInConfig(); err == nil {
	} else if _, ok := err.(viper.ConfigFileNotFoundError); !ok && !os.IsNotExist(err) {
		cobra.CheckErr(err)
	}

	loaded, err := config.Load(viper.GetViper(), cfgFile)
	if err != nil {
		cobra.CheckErr(err)
	}
	appConfig = loaded
	cliruntime.Configure(&appConfig)

	if err := configureLogger(appConfig.LogLevel, appConfig.LogFormat); err != nil {
		cobra.CheckErr(err)
	}

	if err := output.SetFormat(viper.GetString("output")); err != nil {
		cobra.CheckErr(err)
	}

	if used := viper.ConfigFileUsed(); used != "" {
		log.Debug().Str("file", used).Msg("using config file")
	}
}

// activeLogFileWriter holds the current daemon log file writer so it can be
// closed on shutdown and referenced for status/diagnostics.
var activeLogFileWriter *logx.FileWriter

func configureLogger(level string, format string) error {
	cfg := logx.Config{
		Level:  level,
		Format: format,
		Out:    os.Stderr,
	}
	if activeLogFileWriter != nil {
		cfg.FileOut = activeLogFileWriter
	}
	return logx.Configure(cfg)
}

// configureDaemonLogFile opens (or re-uses) a rotating log file writer at the
// given path and reconfigures the global logger to also write to it.
func configureDaemonLogFile(path string) error {
	if activeLogFileWriter != nil {
		// Already configured (e.g. logger was reconfigured after config load).
		return nil
	}

	fw, err := logx.NewFileWriter(logx.FileWriterConfig{Path: path})
	if err != nil {
		return err
	}
	activeLogFileWriter = fw

	return configureLogger(appConfig.LogLevel, appConfig.LogFormat)
}

// closeDaemonLogFile closes the active log file writer if one is open.
func closeDaemonLogFile() {
	if activeLogFileWriter != nil {
		_ = activeLogFileWriter.Close()
		activeLogFileWriter = nil
	}
}

// ClassifyError maps a command error to a short machine-readable code.
// The codes are intentionally stable strings that agents can match on.
func ClassifyError(err error) string {
	// Daemon sentinel
	if errors.Is(err, daemon.ErrNotRunning) {
		return "daemon_not_running"
	}

	// API errors — map HTTP status to a code
	var apiErr *api.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.StatusCode {
		case http.StatusBadRequest:
			return "validation_error"
		case http.StatusUnauthorized:
			return "unauthenticated"
		case http.StatusForbidden:
			return "permission_denied"
		case http.StatusNotFound:
			return "not_found"
		case http.StatusConflict:
			return "conflict"
		}
		if apiErr.StatusCode >= 500 {
			return "server_error"
		}
	}

	// Token refresh failure (wraps an API 401)
	var refreshErr *api.TokenRefreshError
	if errors.As(err, &refreshErr) {
		return "unauthenticated"
	}

	return "error"
}

