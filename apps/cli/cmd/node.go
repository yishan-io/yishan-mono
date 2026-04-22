package cmd

import (
	"net/http"

	"github.com/spf13/cobra"
)

var nodeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization nodes",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}

		return doAPIJSON(http.MethodGet, "/orgs/"+orgID+"/nodes", nil)
	},
}

var nodeCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization node",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		scope, err := cmd.Flags().GetString("scope")
		if err != nil {
			return err
		}
		endpoint, err := cmd.Flags().GetString("endpoint")
		if err != nil {
			return err
		}
		metadataOS, err := cmd.Flags().GetString("metadata-os")
		if err != nil {
			return err
		}
		metadataVersion, err := cmd.Flags().GetString("metadata-version")
		if err != nil {
			return err
		}

		payload := map[string]any{
			"name":  name,
			"scope": scope,
		}
		if endpoint != "" {
			payload["endpoint"] = endpoint
		}
		if metadataOS != "" || metadataVersion != "" {
			metadata := map[string]string{}
			if metadataOS != "" {
				metadata["os"] = metadataOS
			}
			if metadataVersion != "" {
				metadata["version"] = metadataVersion
			}
			payload["metadata"] = metadata
		}

		return doAPIJSON(http.MethodPost, "/orgs/"+orgID+"/nodes", payload)
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization node",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}

		return doAPIJSON(http.MethodDelete, "/orgs/"+orgID+"/nodes/"+nodeID, nil)
	},
}

var nodeCmd = &cobra.Command{Use: "node", Short: "Node operations"}

func init() {
	rootCmd.AddCommand(nodeCmd)
	nodeCmd.AddCommand(nodeListCmd)
	nodeCmd.AddCommand(nodeCreateCmd)
	nodeCmd.AddCommand(nodeDeleteCmd)

	nodeListCmd.Flags().String("org-id", "", "organization ID")
	cobra.CheckErr(nodeListCmd.MarkFlagRequired("org-id"))

	nodeCreateCmd.Flags().String("org-id", "", "organization ID")
	nodeCreateCmd.Flags().String("name", "", "node name")
	nodeCreateCmd.Flags().String("scope", "remote", "node scope (local|remote)")
	nodeCreateCmd.Flags().String("endpoint", "", "node endpoint URL")
	nodeCreateCmd.Flags().String("metadata-os", "", "node OS metadata")
	nodeCreateCmd.Flags().String("metadata-version", "", "node version metadata")
	cobra.CheckErr(nodeCreateCmd.MarkFlagRequired("org-id"))
	cobra.CheckErr(nodeCreateCmd.MarkFlagRequired("name"))

	nodeDeleteCmd.Flags().String("org-id", "", "organization ID")
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("org-id"))
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))
}
