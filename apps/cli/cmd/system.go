package cmd

import (
	"net/http"

	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "Check API health",
	RunE: func(_ *cobra.Command, _ []string) error {
		return doAPIJSON(http.MethodGet, "/health", nil)
	},
}

var meCmd = &cobra.Command{
	Use:   "me",
	Short: "Show current authenticated user",
	RunE: func(_ *cobra.Command, _ []string) error {
		return doAPIJSON(http.MethodGet, "/me", nil)
	},
}

func init() {
	rootCmd.AddCommand(healthCmd)
	rootCmd.AddCommand(meCmd)
}
