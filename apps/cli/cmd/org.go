package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/manifoldco/promptui"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/output"
)

var orgListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organizations",
	Long:  `List all organizations the authenticated user is a member of.`,
	Example: `  yishan org list
  yishan org list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return err
		}

		response, err := apiClient.ListOrganizations()
		if err != nil {
			return err
		}

		renderData, err := toOrgListRenderData(response, verbose)
		if err != nil {
			return err
		}

		return output.PrintRenderData(renderData)
	},
}

var orgCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization",
	Long:  `Create a new Yishan organization. The authenticated user becomes the first admin member.`,
	Example: `  yishan org create --name "My Org"
  yishan org create --name "My Org" --member-user-id uid1 --member-user-id uid2`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		memberUserIDs, err := cmd.Flags().GetStringSlice("member-user-id")
		if err != nil {
			return err
		}

		response, err := apiClient.CreateOrganization(api.CreateOrganizationInput{
			Name:          name,
			MemberUserIDs: memberUserIDs,
		})
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgDeleteCmd = &cobra.Command{
	Use:     "delete",
	Short:   "Delete organization",
	Long:    `Permanently delete an organization and all its projects and workspaces. This action cannot be undone.`,
	Example: `  yishan org delete --org-id <org-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := apiClient.DeleteOrganization(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgMemberAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add organization member",
	Long:  `Add a user to the current organization. Role defaults to "member".`,
	Example: `  yishan org member add --user-id <uid>
  yishan org member add --user-id <uid> --role admin`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		userID, err := cmd.Flags().GetString("user-id")
		if err != nil {
			return err
		}
		role, err := cmd.Flags().GetString("role")
		if err != nil {
			return err
		}

		response, err := apiClient.AddOrganizationMember(orgID, userID, role)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgMemberRemoveCmd = &cobra.Command{
	Use:     "remove",
	Short:   "Remove organization member",
	Long:    `Remove a user from the current organization.`,
	Example: `  yishan org member remove --user-id <uid>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		userID, err := cmd.Flags().GetString("user-id")
		if err != nil {
			return err
		}

		response, err := apiClient.RemoveOrganizationMember(orgID, userID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgCmd = &cobra.Command{
	Use:   "org",
	Short: "Organization operations",
	Long:  `Create, list, delete, and manage membership for Yishan organizations.`,
}

var orgMemberCmd = &cobra.Command{
	Use:   "member",
	Short: "Organization member operations",
	Long:  `Add and remove members from a Yishan organization.`,
}

var orgDefaultCmd = &cobra.Command{
	Use:   "default",
	Short: "Get or set the default organization",
	Long: `Print the default organization used by CLI commands, or set it with --org-id.

The default org is used whenever --org-id is not passed explicitly. It is
stored in context.yaml and is independent of which org is selected in the app.

Examples:
  yishan org default                      # print current default
  yishan org default --org-id <org-id>    # set default interactively
  yishan org default --org-id <org-id>    # set default to a specific org`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}

		// Set mode: --org-id provided.
		if strings.TrimSpace(orgID) != "" {
			orgID = strings.TrimSpace(orgID)
			if err := config.UpdateContext(appConfig.ContextPath, func(cfg *viper.Viper) {
				cfg.Set(config.KeyDefaultOrgID, orgID)
			}); err != nil {
				return err
			}
			appConfig.DefaultOrgID = orgID
			if !output.IsJSONOutput() {
				fmt.Printf("Default organization: %s\n", orgID)
				return nil
			}
			return output.PrintAny(map[string]string{"orgId": orgID, "status": "default"})
		}

		// Get mode: print the current default.
		if appConfig.DefaultOrgID == "" {
			return fmt.Errorf("no default org set: run `yishan org default --org-id <org-id>`")
		}

		if !output.IsJSONOutput() {
			fmt.Println(appConfig.DefaultOrgID)
			return nil
		}
		return output.PrintAny(map[string]string{"orgId": appConfig.DefaultOrgID})
	},
}

func selectOrganizationInteractive(cmd *cobra.Command) (string, error) {
	if stat, err := os.Stdin.Stat(); err != nil || (stat.Mode()&os.ModeCharDevice) == 0 {
		return "", fmt.Errorf("org-id is required: use --org-id <org-id>")
	}

	response, err := apiClient.ListOrganizations()
	if err != nil {
		return "", err
	}
	if len(response.Organizations) == 0 {
		return "", fmt.Errorf("no organizations available for your account")
	}

	items := make([]string, 0, len(response.Organizations))
	for _, organization := range response.Organizations {
		items = append(items, fmt.Sprintf("%s (%s)", organization.Name, organization.ID))
	}

	prompt := promptui.Select{
		Label: "Select organization",
		Items: items,
		Size:  12,
	}

	index, _, err := prompt.Run()
	if err != nil {
		return "", err
	}

	return response.Organizations[index].ID, nil
}

var orgClearCmd = &cobra.Command{
	Use:   "clear",
	Short: "Clear the default organization",
	RunE: func(_ *cobra.Command, _ []string) error {
		if err := config.UpdateContext(appConfig.ContextPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyDefaultOrgID, "")
		}); err != nil {
			return err
		}

		appConfig.DefaultOrgID = ""
		return output.PrintAny(map[string]string{"status": "cleared"})
	},
}

func init() {
	rootCmd.AddCommand(orgCmd)

	orgCmd.AddCommand(orgListCmd)
	orgCmd.AddCommand(orgCreateCmd)
	orgCmd.AddCommand(orgDeleteCmd)
	orgCmd.AddCommand(orgDefaultCmd)
	orgCmd.AddCommand(orgClearCmd)
	orgCmd.AddCommand(orgMemberCmd)
	orgMemberCmd.AddCommand(orgMemberAddCmd)
	orgMemberCmd.AddCommand(orgMemberRemoveCmd)

	orgCreateCmd.Flags().String("name", "", "organization name")
	orgCreateCmd.Flags().StringSlice("member-user-id", []string{}, "additional member user id")
	cobra.CheckErr(orgCreateCmd.MarkFlagRequired("name"))
	orgListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")

	addOrgIDFlag(orgDeleteCmd)

	orgDefaultCmd.Flags().String("org-id", "", "organization ID to set as default")

	addOrgIDFlag(orgMemberAddCmd)
	orgMemberAddCmd.Flags().String("user-id", "", "member user ID")
	orgMemberAddCmd.Flags().String("role", "member", "member role (member|admin)")
	cobra.CheckErr(orgMemberAddCmd.MarkFlagRequired("user-id"))

	addOrgIDFlag(orgMemberRemoveCmd)
	orgMemberRemoveCmd.Flags().String("user-id", "", "member user ID")
	cobra.CheckErr(orgMemberRemoveCmd.MarkFlagRequired("user-id"))
}
