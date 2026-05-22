package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "Check API health",
	Long:  `Check the health of the Yishan API service. Exits with a non-zero code if the API is unreachable.`,
	Example: `  yishan health
  yishan health --output json`,
	RunE: func(_ *cobra.Command, _ []string) error {
		response, err := cliruntime.APIClient().Health()
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var whoamiCmd = &cobra.Command{
	Use:     "whoami",
	Aliases: []string{"me"},
	Short:   "Show current authenticated user",
	Long:    `Show the identity of the currently authenticated user based on the active API token.`,
	Example: `  yishan whoami
  yishan whoami --output json`,
	RunE: func(_ *cobra.Command, _ []string) error {
		response, err := cliruntime.APIClient().WhoAmI()
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

func init() {
	rootCmd.AddCommand(healthCmd)
	rootCmd.AddCommand(whoamiCmd)
}
