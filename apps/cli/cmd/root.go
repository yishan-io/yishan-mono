package cmd

import (
	"os"
	"strings"
	"yishan/apps/cli/internal/config"
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
	rootCmd.PersistentFlags().String("output", "default", "output format (default, json)")
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

func configureLogger(level string, format string) error {
	return logx.Configure(logx.Config{
		Level:  level,
		Format: format,
		Out:    os.Stderr,
	})
}
