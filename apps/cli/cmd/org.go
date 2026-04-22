package cmd

import (
	"net/http"

	"github.com/spf13/cobra"
)

var orgListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organizations",
	RunE: func(_ *cobra.Command, _ []string) error {
		return doAPIJSON(http.MethodGet, "/orgs", nil)
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

		return doAPIJSON(http.MethodPost, "/orgs", map[string]any{
			"name":          name,
			"memberUserIds": memberUserIDs,
		})
	},
}

var orgDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}

		return doAPIJSON(http.MethodDelete, "/orgs/"+orgID, nil)
	},
}

var orgMemberAddCmd = &cobra.Command{
	Use:   "add",
	Short: "Add organization member",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
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

		return doAPIJSON(http.MethodPost, "/orgs/"+orgID+"/members", map[string]string{
			"userId": userID,
			"role":   role,
		})
	},
}

var orgMemberRemoveCmd = &cobra.Command{
	Use:   "remove",
	Short: "Remove organization member",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := cmd.Flags().GetString("org-id")
		if err != nil {
			return err
		}
		userID, err := cmd.Flags().GetString("user-id")
		if err != nil {
			return err
		}

		return doAPIJSON(http.MethodDelete, "/orgs/"+orgID+"/members/"+userID, nil)
	},
}

var orgCmd = &cobra.Command{Use: "org", Short: "Organization operations"}
var orgMemberCmd = &cobra.Command{Use: "member", Short: "Organization member operations"}

func init() {
	rootCmd.AddCommand(orgCmd)

	orgCmd.AddCommand(orgListCmd)
	orgCmd.AddCommand(orgCreateCmd)
	orgCmd.AddCommand(orgDeleteCmd)
	orgCmd.AddCommand(orgMemberCmd)
	orgMemberCmd.AddCommand(orgMemberAddCmd)
	orgMemberCmd.AddCommand(orgMemberRemoveCmd)

	orgCreateCmd.Flags().String("name", "", "organization name")
	orgCreateCmd.Flags().StringSlice("member-user-id", []string{}, "additional member user id")
	cobra.CheckErr(orgCreateCmd.MarkFlagRequired("name"))

	orgDeleteCmd.Flags().String("org-id", "", "organization ID")
	cobra.CheckErr(orgDeleteCmd.MarkFlagRequired("org-id"))

	orgMemberAddCmd.Flags().String("org-id", "", "organization ID")
	orgMemberAddCmd.Flags().String("user-id", "", "member user ID")
	orgMemberAddCmd.Flags().String("role", "member", "member role (member|admin)")
	cobra.CheckErr(orgMemberAddCmd.MarkFlagRequired("org-id"))
	cobra.CheckErr(orgMemberAddCmd.MarkFlagRequired("user-id"))

	orgMemberRemoveCmd.Flags().String("org-id", "", "organization ID")
	orgMemberRemoveCmd.Flags().String("user-id", "", "member user ID")
	cobra.CheckErr(orgMemberRemoveCmd.MarkFlagRequired("org-id"))
	cobra.CheckErr(orgMemberRemoveCmd.MarkFlagRequired("user-id"))
}
