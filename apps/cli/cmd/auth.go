package cmd

import (
	"net/http"

	"github.com/spf13/cobra"
)

var refreshCmd = &cobra.Command{
	Use:   "refresh",
	Short: "Refresh access token",
	RunE: func(cmd *cobra.Command, _ []string) error {
		refreshToken, err := cmd.Flags().GetString("refresh-token")
		if err != nil {
			return err
		}

		return doAPIJSON(http.MethodPost, "/auth/refresh", map[string]string{
			"refreshToken": refreshToken,
		})
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

		return doAPIJSON(http.MethodPost, "/auth/revoke", map[string]string{
			"refreshToken": refreshToken,
		})
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

	refreshCmd.Flags().String("refresh-token", "", "refresh token")
	revokeCmd.Flags().String("refresh-token", "", "refresh token")
	cobra.CheckErr(refreshCmd.MarkFlagRequired("refresh-token"))
	cobra.CheckErr(revokeCmd.MarkFlagRequired("refresh-token"))
}
