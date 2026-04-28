package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
)

var nodeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization nodes",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := apiClient().ListNodes(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization node",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
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

		input := api.CreateNodeInput{
			Name:     name,
			Scope:    scope,
			Endpoint: endpoint,
		}
		if metadataOS != "" || metadataVersion != "" {
			metadata := map[string]any{}
			if metadataOS != "" {
				metadata["os"] = metadataOS
			}
			if metadataVersion != "" {
				metadata["version"] = metadataVersion
			}
			input.Metadata = metadata
		}

		response, err := apiClient().CreateNode(orgID, input)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization node",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}

		response, err := apiClient().DeleteNode(orgID, nodeID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeCmd = &cobra.Command{Use: "node", Short: "Node operations"}

func init() {
	rootCmd.AddCommand(nodeCmd)
	nodeCmd.AddCommand(nodeListCmd)
	nodeCmd.AddCommand(nodeCreateCmd)
	nodeCmd.AddCommand(nodeDeleteCmd)

	nodeListCmd.Flags().String("org-id", "", "organization ID")

	nodeCreateCmd.Flags().String("org-id", "", "organization ID")
	nodeCreateCmd.Flags().String("name", "", "node name")
	nodeCreateCmd.Flags().String("scope", "shared", "node scope (private|shared)")
	nodeCreateCmd.Flags().String("endpoint", "", "node endpoint URL")
	nodeCreateCmd.Flags().String("metadata-os", "", "node OS metadata")
	nodeCreateCmd.Flags().String("metadata-version", "", "node version metadata")
	cobra.CheckErr(nodeCreateCmd.MarkFlagRequired("name"))

	nodeDeleteCmd.Flags().String("org-id", "", "organization ID")
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))
}
