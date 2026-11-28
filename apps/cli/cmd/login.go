package cmd

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/cloud/login"
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

		return output.PrintAny(map[string]string{"status": "ok", "message": "login successful"})
	},
}

func init() {
	rootCmd.AddCommand(loginCmd)
	loginCmd.Flags().String("provider", "google", "oauth provider (google|github)")
}
