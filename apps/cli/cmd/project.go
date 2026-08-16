package cmd

import (
	"context"

	"github.com/spf13/cobra"
	"yishan/apps/cli/cmd/output"
)

var projectCmd = &cobra.Command{
	Use:   "project",
	Short: "Project operations",
	Long:  `List projects for the current organization (remote-authoritative).`,
}

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List projects",
	Long:  `List all projects in the current organization (read from the remote API through the daemon).`,
	Example: `  yishan project list
  yishan project list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err == nil {
			var projects any
			if callErr := client.Call(context.Background(), "project.list", map[string]any{"organizationId": orgID}, &projects); callErr == nil {
				return output.PrintAny(projects)
			}
		}

		return output.PrintAny([]string{})
	},
}

func init() {
	rootCmd.AddCommand(projectCmd)
	projectCmd.AddCommand(projectListCmd)

	addOrgIDFlag(projectListCmd)
	projectListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")
}
