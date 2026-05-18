package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var projectListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization projects",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().ListProjects(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var projectCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create organization project",
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

		response, err := cliruntime.APIClient().CreateProject(orgID, api.CreateProjectInput{
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

var projectCmd = &cobra.Command{Use: "project", Short: "Project operations"}

func init() {
	rootCmd.AddCommand(projectCmd)
	projectCmd.AddCommand(projectListCmd)
	projectCmd.AddCommand(projectCreateCmd)

	addOrgIDFlag(projectListCmd)

	addOrgIDFlag(projectCreateCmd)
	projectCreateCmd.Flags().String("name", "", "project name")
	projectCreateCmd.Flags().String("source-type-hint", "", "source type hint (unknown|git-local)")
	projectCreateCmd.Flags().String("repo-url", "", "repository URL")
	projectCreateCmd.Flags().String("node-id", "", "node ID")
	projectCreateCmd.Flags().String("local-path", "", "local path")
	cobra.CheckErr(projectCreateCmd.MarkFlagRequired("name"))
}
