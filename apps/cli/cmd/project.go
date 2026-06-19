package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
)

var projectCmd = &cobra.Command{
	Use:   "project",
	Short: "Project operations",
	Long:  `Create, list, and delete projects within a Yishan organization.`,
}

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization projects",
	Long:  `List all projects in the current organization.`,
	Example: `  yishan project list
  yishan project list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return err
		}

		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := apiClient.ListProjects(orgID)
		if err != nil {
			return err
		}

		return output.PrintRenderData(renderProjectsList(response, verbose))
	},
}

var projectCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization project",
	Long:  `Create a new project in the current organization. Optionally link it to a git repository and a compute node.`,
	Example: `  yishan project create --name "my-project"
  yishan project create --name "my-project" --local-path /path/to/repo --node-id <node-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		sourceTypeHint, err := cmd.Flags().GetString("source-type-hint")
		if err != nil {
			return err
		}
		repoURL, err := cmd.Flags().GetString("repo-url")
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}
		localPath, err := cmd.Flags().GetString("local-path")
		if err != nil {
			return err
		}

		response, err := apiClient.CreateProject(orgID, api.CreateProjectInput{
			Name:           name,
			SourceTypeHint: sourceTypeHint,
			RepoURL:        repoURL,
			NodeID:         nodeID,
			LocalPath:      localPath,
		})
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var projectDeleteCmd = &cobra.Command{
	Use:     "delete",
	Short:   "Delete organization project",
	Long:    `Permanently delete a project and all its workspaces. This action cannot be undone.`,
	Example: `  yishan project delete --project-id <project-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}

		response, err := apiClient.DeleteProject(orgID, projectID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
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
	projectCreateCmd.Flags().String("source-type-hint", "", "source type hint (unknown|git-local)")
	projectCreateCmd.Flags().String("repo-url", "", "repository URL")
	projectCreateCmd.Flags().String("node-id", "", "node ID")
	projectCreateCmd.Flags().String("local-path", "", "local path")
	cobra.CheckErr(projectCreateCmd.MarkFlagRequired("name"))

	addOrgIDFlag(projectDeleteCmd)
	projectDeleteCmd.Flags().String("project-id", "", "project ID")
	cobra.CheckErr(projectDeleteCmd.MarkFlagRequired("project-id"))
}
