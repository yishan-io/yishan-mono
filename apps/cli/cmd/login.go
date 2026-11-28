package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/adapter/cloud"
	release "yishan/apps/cli/internal/platform/release"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/adapter/cloud/login"
	nodeid "yishan/apps/cli/internal/node/id"
	"yishan/apps/cli/cmd/output"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login via OAuth in browser",
	Long: `Authenticate with Yishan via an OAuth browser flow.

Opens your default browser to complete authentication with the selected
provider. On success the access and refresh tokens are persisted to the
local credential file and the local daemon node is registered with the API.`,
	Example: `  yishan login
  yishan login --provider github`,
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

		// The access token is a JWT signed by api-service; decode the sub
		// claim locally so the account data dir resolves to accounts/<userId>/
		// without an extra network call. On the rare parse failure, fall back
		// to WhoAmI so the persisted user_id always matches the new account
		// (a stale user_id would otherwise pin the wrong account dir).
		userID, ok := cloud.ParseUserIDFromJWT(result.AccessToken)
		if !ok {
			if me, whoAmIErr := cloud.NewClient(appConfig.API.BaseURL, result.AccessToken, "", "", "", nil).WhoAmI(); whoAmIErr == nil {
				userID = me.User.ID
			}
		}

		persistenceResult, err := persistAuthTokensForLogin(cmd.Context(), cloud.TokenUpdate{
			AccessToken:           result.AccessToken,
			RefreshToken:          result.RefreshToken,
			AccessTokenExpiresAt:  result.AccessTokenExpiresAt,
			RefreshTokenExpiresAt: result.RefreshTokenExpiresAt,
			UserID:                userID,
		})
		if err != nil {
			return err
		}
		if persistenceResult.Warning != nil {
			log.Warn().Err(persistenceResult.Warning).Msg("failed to sync auth tokens to running daemon after login")
			_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Warning: running daemon auth session was not refreshed; restart the daemon or login again if daemon requests re-authentication: %v\n", persistenceResult.Warning)
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
	client := cloud.NewClient(
		appConfig.API.BaseURL,
		appConfig.API.Token,
		appConfig.API.RefreshToken,
		appConfig.API.AccessTokenExpiresAt,
		appConfig.API.RefreshTokenExpiresAt,
		nil,
	)
	_, err = client.RegisterNode(cloud.RegisterNodeInput{
		NodeID: daemonID,
		Name:   hostname,
		Kind:   "managed",
		Scope:  "private",
		Metadata: map[string]any{
			"os":      runtime.GOOS,
			"version": release.Version,
		},
		UpdateIfExists: &updateIfExists,
	})
	if err != nil {
		return fmt.Errorf("register node %q: %w", daemonID, err)
	}

	log.Debug().Str("nodeId", daemonID).Str("hostname", hostname).Msg("registered local node after login")
	return nil
}
