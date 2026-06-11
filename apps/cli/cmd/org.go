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
		showAll, err := cmd.Flags().GetBool("all")
		if err != nil {
			return err
		}
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return err
		}

		response, err := apiClient.ListOrganizations()
		if err != nil {
			return err
		}

		renderData, err := toOrgListRenderData(response, showAll || verbose)
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

var orgUseCmd = &cobra.Command{
	Use:   "use",
	Short: "Set current organization",
	Long: `Set the current organization used by all commands that accept --org-id.

Preferred usage:
  yishan org use --org-id <org-id>

Passing the org ID as a positional argument is deprecated and will be removed
in a future release:
  yishan org use <org-id>   # deprecated`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		flagOrgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}

		var orgID string
		switch {
		case strings.TrimSpace(flagOrgID) != "":
			orgID = strings.TrimSpace(flagOrgID)
		case len(args) == 1:
			_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "Warning: passing org-id as a positional argument is deprecated. Use --org-id instead.\n")
			orgID = args[0]
		default:
			selectedOrgID, selectionErr := selectOrganizationInteractive(cmd)
			if selectionErr != nil {
				return selectionErr
			}
			orgID = selectedOrgID
		}

		if err := config.UpdateContext(appConfig.ContextPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyContextOrgID, orgID)
		}); err != nil {
			return err
		}

		appConfig.CurrentOrgID = orgID
		if !output.IsJSONOutput() {
			fmt.Printf("Active organization: %s\n", orgID)
			return nil
		}

		return output.PrintAny(map[string]string{"orgId": orgID, "status": "active"})
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

var orgCurrentCmd = &cobra.Command{
	Use:   "current",
	Short: "Show current organization",
	RunE: func(_ *cobra.Command, _ []string) error {
		if appConfig.CurrentOrgID == "" {
			return fmt.Errorf("no active org: run `yishan org use <org-id>`")
		}

		response, err := apiClient.ListOrganizations()
		if err != nil {
			return err
		}

		for _, organization := range response.Organizations {
			if organization.ID == appConfig.CurrentOrgID {
				// In JSON mode emit a single combined object so consumers get
				// one parseable document. In default mode keep the two-table
				// human-readable layout.
				if output.IsJSONOutput() {
					return output.PrintAny(toOrgCurrentCombinedObject(organization))
				}

				if err := output.PrintRenderData(toOrgCurrentRenderData(organization)); err != nil {
					return err
				}

				return output.PrintRenderData(toOrgMembersRenderData(organization))
			}
		}

		return fmt.Errorf("current org %s not found in accessible organizations", appConfig.CurrentOrgID)
	},
}

var orgClearCmd = &cobra.Command{
	Use:   "clear",
	Short: "Clear current organization",
	RunE: func(_ *cobra.Command, _ []string) error {
		if err := config.UpdateContext(appConfig.ContextPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyContextOrgID, "")
		}); err != nil {
			return err
		}

		appConfig.CurrentOrgID = ""
		return output.PrintAny(map[string]string{"status": "cleared"})
	},
}

func init() {
	rootCmd.AddCommand(orgCmd)

	orgCmd.AddCommand(orgListCmd)
	orgCmd.AddCommand(orgCreateCmd)
	orgCmd.AddCommand(orgDeleteCmd)
	orgCmd.AddCommand(orgUseCmd)
	orgCmd.AddCommand(orgCurrentCmd)
	orgCmd.AddCommand(orgClearCmd)
	orgCmd.AddCommand(orgMemberCmd)
	orgMemberCmd.AddCommand(orgMemberAddCmd)
	orgMemberCmd.AddCommand(orgMemberRemoveCmd)

	orgCreateCmd.Flags().String("name", "", "organization name")
	orgCreateCmd.Flags().StringSlice("member-user-id", []string{}, "additional member user id")
	cobra.CheckErr(orgCreateCmd.MarkFlagRequired("name"))
	orgListCmd.Flags().Bool("all", false, "show full response fields")
	orgListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")

	addOrgIDFlag(orgDeleteCmd)

	orgUseCmd.Flags().String("org-id", "", "organization ID to activate")

	addOrgIDFlag(orgMemberAddCmd)
	orgMemberAddCmd.Flags().String("user-id", "", "member user ID")
	orgMemberAddCmd.Flags().String("role", "member", "member role (member|admin)")
	cobra.CheckErr(orgMemberAddCmd.MarkFlagRequired("user-id"))

	addOrgIDFlag(orgMemberRemoveCmd)
	orgMemberRemoveCmd.Flags().String("user-id", "", "member user ID")
	cobra.CheckErr(orgMemberRemoveCmd.MarkFlagRequired("user-id"))
}
