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
	"yishan/apps/cli/internal/nodeid"
	"yishan/apps/cli/internal/output"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login via OAuth in browser or service token",
	Long: `Authenticate with Yishan via an OAuth browser flow or a service token.

Opens your default browser to complete authentication with the selected
provider. On success the access and refresh tokens are persisted to the
local credential file and the local daemon node is registered with the API.

For non-interactive environments (remote hosts, CI), use --token with a
service token created via "yishan auth create-service-token".`,
	Example: `  yishan login
  yishan login --provider github
  yishan login --token yst_...`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		token, err := cmd.Flags().GetString("token")
		if err != nil {
			return err
		}

		// Service token login (non-interactive)
		if token != "" {
			return loginWithServiceToken(cmd, token)
		}

		// Browser OAuth flow (interactive)
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

		if err := registerLocalNodeAfterLogin(); err != nil {
			log.Warn().Err(err).Msg("failed to register local node after login")
			_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Warning: local node registration failed: %v\n", err)
		} else {
			log.Info().Msg("local node registered successfully after login")
		}

		return output.PrintAny(map[string]string{"status": "ok", "message": "login successful"})
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().String("provider", "google", "oauth provider (google|github)")
	loginCmd.Flags().String("token", "", "service token for non-interactive login (created via 'yishan auth create-service-token')")
}

func loginWithServiceToken(cmd *cobra.Command, token string) error {
	// Persist the service token as the API token (no refresh token needed)
	if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyAPIBaseURL, appConfig.API.BaseURL)
		cfg.Set(config.KeyAPIToken, token)
		cfg.Set(config.KeyAPIRefreshToken, "")
		cfg.Set(config.KeyAPIAccessTokenExpiresAt, "")
		cfg.Set(config.KeyAPIRefreshTokenExpiresAt, "")
	}); err != nil {
		return err
	}

	appConfig.API.Token = token
	appConfig.API.RefreshToken = ""
	appConfig.API.AccessTokenExpiresAt = ""
	appConfig.API.RefreshTokenExpiresAt = ""

	// Verify the token works
	client := api.NewClient(appConfig.API.BaseURL, token, "", "", "", nil)
	me, err := client.WhoAmI()
	if err != nil {
		return fmt.Errorf("service token verification failed: %w", err)
	}

	_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Authenticated as %s (%s)\n", me.User.Email, me.User.Name)

	if err := registerLocalNodeAfterLogin(); err != nil {
		log.Warn().Err(err).Msg("failed to register local node after login")
		_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Warning: local node registration failed: %v\n", err)
	}

	return output.PrintAny(map[string]string{"status": "ok", "message": "login successful (service token)"})
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

	daemonIDPath := filepath.Join(filepath.Dir(statePath), nodeid.FileName)
	daemonID, err := nodeid.EnsureDaemonID(daemonIDPath)
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
		Kind:   "managed",
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
