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

// resolveOrgID returns the organization ID to use for a command, in priority order:
//  1. --org-id flag (explicit override)
//  2. default_org_id from settings.yaml, which the daemon writes whenever the
//     desktop app selects an organization
func resolveOrgID(cmd *cobra.Command) (string, error) {
	orgID, err := cmd.Flags().GetString("org-id")
	if err != nil {
		return "", err
	}
	if orgID != "" {
		return orgID, nil
	}

	if appConfig.DefaultOrgID != "" {
		return appConfig.DefaultOrgID, nil
	}

	return "", fmt.Errorf("no organization selected: open the Yishan app once or pass --org-id")
}
