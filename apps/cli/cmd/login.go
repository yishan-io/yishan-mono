package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/login"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login via OAuth in browser",
	RunE: func(cmd *cobra.Command, _ []string) error {
		provider, err := cmd.Flags().GetString("provider")
		if err != nil {
			return err
		}
		if provider != "google" && provider != "github" {
			return fmt.Errorf("unsupported provider %q (allowed: google, github)", provider)
		}

		result, err := login.RunBrowserFlow(context.Background(), login.FlowConfig{
			BaseURL:  appConfig.API.BaseURL,
			Provider: provider,
		})
		if err != nil {
			return err
		}

		if err := persistAPITokens(result); err != nil {
			return err
		}

		fmt.Println("Login successful. API token saved to local config.")

		if err := registerLocalNodeAfterLogin(); err != nil {
			log.Warn().Err(err).Msg("failed to register local node after login")
			fmt.Printf("Warning: local node registration failed: %v\n", err)
		} else {
			log.Info().Msg("local node registered successfully after login")
		}

		return nil
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().String("provider", "google", "oauth provider (google|github)")
}

func persistAPITokens(result login.FlowResult) error {
	if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIBaseURL, appConfig.API.BaseURL)
		cfg.Set(config.KeyAPIToken, result.AccessToken)
		cfg.Set(config.KeyAPIRefreshToken, result.RefreshToken)
		cfg.Set(config.KeyAPIAccessTokenExpiresAt, result.AccessTokenExpiresAt)
		cfg.Set(config.KeyAPIRefreshTokenExpiresAt, result.RefreshTokenExpiresAt)
	}); err != nil {
		return err
	}

	appConfig.API.Token = result.AccessToken
	appConfig.API.RefreshToken = result.RefreshToken
	appConfig.API.AccessTokenExpiresAt = result.AccessTokenExpiresAt
	appConfig.API.RefreshTokenExpiresAt = result.RefreshTokenExpiresAt
	return nil
}

// registerLocalNodeAfterLogin registers the local daemon node with the API
// immediately after login so that downstream workspace/project flows have
// a node available without waiting for the daemon to start. The call is
// idempotent — the API upserts on the daemon ID.
func registerLocalNodeAfterLogin() error {
	if appConfig.API.BaseURL == "" || appConfig.API.Token == "" {
		return fmt.Errorf("API is not configured; skipping node registration")
	}

	statePath, err := daemon.ResolveStateFilePath(appConfig.ConfigPath)
	if err != nil {
		return fmt.Errorf("resolve daemon state path: %w", err)
	}

	daemonIDPath := filepath.Join(filepath.Dir(statePath), daemon.IDFileName)
	daemonID, err := daemon.EnsureDaemonID(daemonIDPath)
	if err != nil {
		return fmt.Errorf("ensure daemon id: %w", err)
	}

	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	updateIfExists := false
	client := api.NewClient(
		appConfig.API.BaseURL,
		appConfig.API.Token,
		appConfig.API.RefreshToken,
		appConfig.API.AccessTokenExpiresAt,
		appConfig.API.RefreshTokenExpiresAt,
		nil,
	)
	_, err = client.RegisterNode(api.RegisterNodeInput{
		NodeID: daemonID,
		Name:   hostname,
		Scope:  "private",
		Metadata: map[string]any{
			"os":      runtime.GOOS,
			"version": buildinfo.Version,
		},
		UpdateIfExists: &updateIfExists,
	})
	if err != nil {
		return fmt.Errorf("register node %q: %w", daemonID, err)
	}

	log.Debug().Str("nodeId", daemonID).Str("hostname", hostname).Msg("registered local node after login")
	return nil
}
