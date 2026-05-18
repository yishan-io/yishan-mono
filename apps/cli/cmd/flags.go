package cmd

import "github.com/spf13/cobra"

// addOrgIDFlag registers the --org-id flag on a command. Use this helper for
// every subcommand that accepts an organization ID so the description and flag
// name stay consistent.
func addOrgIDFlag(cmd *cobra.Command) {
	cmd.Flags().String("org-id", "", "organization ID")
}
