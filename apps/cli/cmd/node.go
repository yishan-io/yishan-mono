package cmd

import (
	"fmt"

	"github.com/manifoldco/promptui"
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/output"
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
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return err
		}

		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := apiClient.ListNodes(orgID)
		if err != nil {
			return err
		}

		return output.PrintRenderData(renderNodesList(response, verbose))
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:     "delete",
	Short:   "Delete organization node",
	Long:    `Deregister a node from the organization. Any workspaces currently assigned to the node will lose their compute backend.`,
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

		response, err := apiClient.DeleteNode(orgID, nodeID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeSetScopeCmd = &cobra.Command{
	Use:   "set-scope",
	Short: "Change a node's scope",
	Long: `Change a compute node's scope between private and shared.

Private nodes are accessible only to their owner.
Shared nodes are accessible to all members of the organization.

Permission rules:
  private → shared  Only the node owner may make their node shared.
  shared  → private Only organization owners or admins may demote a shared node.`,
	Example: `  yishan node set-scope --node-id <node-id> --scope shared
  yishan node set-scope --node-id <node-id> --scope private --force`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}
		scope, err := cmd.Flags().GetString("scope")
		if err != nil {
			return err
		}
		if scope != "private" && scope != "shared" {
			return fmt.Errorf("--scope must be \"private\" or \"shared\"")
		}
		force, err := cmd.Flags().GetBool("force")
		if err != nil {
			return err
		}

		if !force {
			var warning string
			if scope == "shared" {
				warning = fmt.Sprintf("Making node %q shared will allow all organization members to use it.", nodeID)
			} else {
				warning = fmt.Sprintf("Making node %q private will restrict access to the node owner only. Workspaces using this node may lose access.", nodeID)
			}

			prompt := promptui.Select{
				Label: warning + " Proceed?",
				Items: []string{"Yes", "No"},
			}
			_, choice, promptErr := prompt.Run()
			if promptErr != nil {
				return promptErr
			}
			if choice != "Yes" {
				fmt.Fprintln(cmd.OutOrStdout(), "Aborted.")
				return nil
			}
		}

		response, err := apiClient.UpdateNodeScope(orgID, nodeID, scope)
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
	nodeCmd.AddCommand(nodeSetScopeCmd)

	addOrgIDFlag(nodeListCmd)
	nodeListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")

	addOrgIDFlag(nodeDeleteCmd)
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))

	addOrgIDFlag(nodeSetScopeCmd)
	nodeSetScopeCmd.Flags().String("node-id", "", "node ID")
	nodeSetScopeCmd.Flags().String("scope", "", "target scope: \"private\" or \"shared\"")
	nodeSetScopeCmd.Flags().Bool("force", false, "skip confirmation prompt")
	cobra.CheckErr(nodeSetScopeCmd.MarkFlagRequired("node-id"))
	cobra.CheckErr(nodeSetScopeCmd.MarkFlagRequired("scope"))
}
