package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

// addOrgIDFlag registers the --org-id flag on a command. Use this helper for
// every subcommand that accepts an organization ID so the description and flag
// name stay consistent.
func addOrgIDFlag(cmd *cobra.Command) {
	cmd.Flags().String("org-id", "", "organization ID")
}

func resolveOrgID(cmd *cobra.Command) (string, error) {
	orgID, err := cmd.Flags().GetString("org-id")
	if err != nil {
		return "", err
	}
	if orgID != "" {
		return orgID, nil
	}
	if appConfig.CurrentOrgID != "" {
		return appConfig.CurrentOrgID, nil
	}

	return "", fmt.Errorf("no active org: run `yishan org use <org-id>` or pass --org-id")
}
