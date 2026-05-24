package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var refreshCmd = &cobra.Command{
	Use:   "refresh",
	Short: "Refresh access token",
	RunE: func(cmd *cobra.Command, _ []string) error {
		refreshToken, err := cmd.Flags().GetString("refresh-token")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().RefreshToken(refreshToken)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var revokeCmd = &cobra.Command{
	Use:   "revoke",
	Short: "Revoke refresh token",
	RunE: func(cmd *cobra.Command, _ []string) error {
		refreshToken, err := cmd.Flags().GetString("refresh-token")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().RevokeToken(refreshToken)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var createServiceTokenCmd = &cobra.Command{
	Use:   "create-service-token",
	Short: "Create a service token for non-interactive CLI authentication",
	Long: `Create a long-lived service token that can be used to authenticate the CLI
on remote hosts without a browser-based OAuth flow.

The token is displayed only once. Store it securely.

To use on a remote host:
  yishan login --token <yst_...>`,
	Example: `  yishan auth create-service-token --name "my-server"
  yishan auth create-service-token --name "ci-runner" --expires-in-days 90`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		expiresInDays, err := cmd.Flags().GetInt("expires-in-days")
		if err != nil {
			return err
		}

		input := api.CreateServiceTokenInput{Name: name}
		if expiresInDays > 0 {
			input.ExpiresInDays = &expiresInDays
		}

		response, err := cliruntime.APIClient().CreateServiceToken(input)
		if err != nil {
			return err
		}

		_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Service token created. Store it securely — it will not be shown again.\n\n")

		return output.PrintAny(response)
	},
}

var listServiceTokensCmd = &cobra.Command{
	Use:   "list-service-tokens",
	Short: "List service tokens",
	RunE: func(_ *cobra.Command, _ []string) error {
		response, err := cliruntime.APIClient().ListServiceTokens()
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var revokeServiceTokenCmd = &cobra.Command{
	Use:   "revoke-service-token",
	Short: "Revoke a service token",
	RunE: func(cmd *cobra.Command, _ []string) error {
		tokenID, err := cmd.Flags().GetString("id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().RevokeServiceToken(tokenID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication operations",
}

func init() {
	rootCmd.AddCommand(authCmd)
	authCmd.AddCommand(refreshCmd)
	authCmd.AddCommand(revokeCmd)
	authCmd.AddCommand(createServiceTokenCmd)
	authCmd.AddCommand(listServiceTokensCmd)
	authCmd.AddCommand(revokeServiceTokenCmd)

	refreshCmd.Flags().String("refresh-token", "", "refresh token")
	revokeCmd.Flags().String("refresh-token", "", "refresh token")
	cobra.CheckErr(refreshCmd.MarkFlagRequired("refresh-token"))
	cobra.CheckErr(revokeCmd.MarkFlagRequired("refresh-token"))

	createServiceTokenCmd.Flags().String("name", "", "descriptive name for the service token")
	createServiceTokenCmd.Flags().Int("expires-in-days", 0, "token expiry in days (0 = no expiry)")
	cobra.CheckErr(createServiceTokenCmd.MarkFlagRequired("name"))

	revokeServiceTokenCmd.Flags().String("id", "", "service token ID to revoke")
	cobra.CheckErr(revokeServiceTokenCmd.MarkFlagRequired("id"))
}
