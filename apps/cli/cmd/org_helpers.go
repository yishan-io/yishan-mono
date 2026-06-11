package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/daemon"
)

// addOrgIDFlag registers the --org-id flag on a command. Use this helper for
// every subcommand that accepts an organization ID so the description and flag
// name stay consistent.
func addOrgIDFlag(cmd *cobra.Command) {
	cmd.Flags().String("org-id", "", "organization ID")
}

// resolveOrgID returns the organization ID to use for a command, in priority order:
//  1. --org-id flag (explicit override)
//  2. daemon context.getState (live state from the running app)
//  3. context.yaml (persisted fallback when daemon is not running)
func resolveOrgID(cmd *cobra.Command) (string, error) {
	orgID, err := cmd.Flags().GetString("org-id")
	if err != nil {
		return "", err
	}
	if orgID != "" {
		return orgID, nil
	}

	// Try the running daemon first — it holds the live org selected in the app.
	if client, err := resolveDaemonClient(); err == nil {
		var state map[string]any
		if err := client.Call(cmd.Context(), daemon.MethodContextGetState, nil, &state); err == nil {
			if id, ok := state["activeOrgId"].(string); ok && id != "" {
				return id, nil
			}
		}
	}

	// Fall back to context.yaml (covers CLI-only / daemon-not-running cases).
	if appConfig.CurrentOrgID != "" {
		return appConfig.CurrentOrgID, nil
	}

	return "", fmt.Errorf("no active org: select one in the app, run `yishan org use <org-id>`, or pass --org-id")
}
