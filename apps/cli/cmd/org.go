package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var orgListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organizations",
	RunE: func(_ *cobra.Command, _ []string) error {
		response, err := cliruntime.APIClient().ListOrganizations()
		if err != nil {
			return err
		}

		renderData, err := toOrgListRenderData(response)
		if err != nil {
			return err
		}

		return output.PrintRenderData(renderData)
	},
}

var orgCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization",
	RunE: func(cmd *cobra.Command, _ []string) error {
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		memberUserIDs, err := cmd.Flags().GetStringSlice("member-user-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().CreateOrganization(api.CreateOrganizationInput{
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
	Use:   "delete",
	Short: "Delete organization",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().DeleteOrganization(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgMemberAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add organization member",
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

		response, err := cliruntime.APIClient().AddOrganizationMember(orgID, userID, role)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgMemberRemoveCmd = &cobra.Command{
	Use:   "remove",
	Short: "Remove organization member",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		userID, err := cmd.Flags().GetString("user-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().RemoveOrganizationMember(orgID, userID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var orgCmd = &cobra.Command{Use: "org", Short: "Organization operations"}
var orgMemberCmd = &cobra.Command{Use: "member", Short: "Organization member operations"}

var orgUseCmd = &cobra.Command{
	Use:   "use <org-id>",
	Short: "Set current organization",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		orgID := args[0]
		if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyCurrentOrgID, orgID)
		}); err != nil {
			return err
		}

		appConfig.CurrentOrgID = orgID
		fmt.Printf("Current org set to %s\n", orgID)
		return nil
	},
}

var orgCurrentCmd = &cobra.Command{
	Use:   "current",
	Short: "Show current organization",
	RunE: func(_ *cobra.Command, _ []string) error {
		if appConfig.CurrentOrgID == "" {
			return fmt.Errorf("no active org: run `yishan org use <org-id>`")
		}

		response, err := cliruntime.APIClient().ListOrganizations()
		if err != nil {
			return err
		}

		for _, organization := range response.Organizations {
			if organization.ID == appConfig.CurrentOrgID {
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
		if err := config.UpdateFile(appConfig.ConfigPath, func(cfg *viper.Viper) {
			cfg.Set(config.KeyCurrentOrgID, "")
		}); err != nil {
			return err
		}

		appConfig.CurrentOrgID = ""
		fmt.Println("Current org cleared")
		return nil
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

	addOrgIDFlag(orgDeleteCmd)

	addOrgIDFlag(orgMemberAddCmd)
	orgMemberAddCmd.Flags().String("user-id", "", "member user ID")
	orgMemberAddCmd.Flags().String("role", "member", "member role (member|admin)")
	cobra.CheckErr(orgMemberAddCmd.MarkFlagRequired("user-id"))

	addOrgIDFlag(orgMemberRemoveCmd)
	orgMemberRemoveCmd.Flags().String("user-id", "", "member user ID")
	cobra.CheckErr(orgMemberRemoveCmd.MarkFlagRequired("user-id"))
}
