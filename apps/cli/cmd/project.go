package cmd

import (
	"context"

	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/output"
)

var projectCmd = &cobra.Command{
	Use:   "project",
	Short: "Project operations",
	Long:  `Create, list, and delete projects from your local workspace database.`,
}

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List local projects",
	Long:  `List all projects in the local database for the current organization.`,
	Example: `  yishan project list
  yishan project list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err == nil {
			var projects any
			if callErr := client.Call(context.Background(), "project.list", map[string]any{"organizationId": orgID}, &projects); callErr == nil {
				return output.PrintAny(projects)
			}
		}

		return output.PrintAny([]string{})
	},
}

var projectCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create local project",
	Long:  `Create a new project in the local database. Optionally link it to a git repository.`,
	Example: `  yishan project create --name "my-project"
  yishan project create --name "my-project" --repo-url https://github.com/owner/repo`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		repoURL, err := cmd.Flags().GetString("repo-url")
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err == nil {
			params := map[string]any{"name": name, "organizationId": orgID}
			if repoURL != "" {
				params["repoUrl"] = repoURL
			}
			var response any
			if callErr := client.Call(context.Background(), "project.create", params, &response); callErr == nil {
				return output.PrintAny(response)
			}
		}

		return output.PrintAny(map[string]string{"status": "daemon required for project creation"})
	},
}

var projectDeleteCmd = &cobra.Command{
	Use:     "delete",
	Short:   "Delete local project",
	Long:    `Permanently delete a project and all its workspaces from the local database. This action cannot be undone.`,
	Example: `  yishan project delete --project-id <project-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err == nil {
			var response any
			if callErr := client.Call(context.Background(), "project.delete", map[string]any{"id": projectID}, &response); callErr == nil {
				return output.PrintAny(response)
			}
		}

		return output.PrintAny(map[string]string{"status": "daemon required for project deletion"})
	},
}

func init() {
	rootCmd.AddCommand(projectCmd)
	projectCmd.AddCommand(projectListCmd)
	projectCmd.AddCommand(projectCreateCmd)
	projectCmd.AddCommand(projectDeleteCmd)

	addOrgIDFlag(projectListCmd)
	projectListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")

	addOrgIDFlag(projectCreateCmd)
	projectCreateCmd.Flags().String("name", "", "project name")
	projectCreateCmd.Flags().String("repo-url", "", "repository URL")
	cobra.CheckErr(projectCreateCmd.MarkFlagRequired("name"))

	addOrgIDFlag(projectDeleteCmd)
	projectDeleteCmd.Flags().String("project-id", "", "project ID")
	cobra.CheckErr(projectDeleteCmd.MarkFlagRequired("project-id"))
}
