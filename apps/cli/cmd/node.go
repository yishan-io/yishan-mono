package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Node operations",
	Long:  `List and delete compute nodes in a Yishan organization.`,
}

var nodeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization nodes",
	Long:  `List all nodes registered to the current organization.`,
	Example: `  yishan node list
  yishan node list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().ListNodes(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization node",
	Long:  `Deregister a node from the organization. Any workspaces currently assigned to the node will lose their compute backend.`,
	Example: `  yishan node delete --node-id <node-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().DeleteNode(orgID, nodeID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

func init() {
	rootCmd.AddCommand(nodeCmd)
	nodeCmd.AddCommand(nodeListCmd)
	nodeCmd.AddCommand(nodeDeleteCmd)

	addOrgIDFlag(nodeListCmd)

	addOrgIDFlag(nodeDeleteCmd)
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))
}
