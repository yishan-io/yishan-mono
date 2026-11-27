package cmd

import (
	"fmt"
	"strings"

	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/workspace"

	"github.com/spf13/cobra"
)

var workspaceListCmd = &cobra.Command{
	Use:   "list",
	Short: "List project workspaces",
	Long:  `List this machine's live workspaces, for one project or across all projects.`,
	Example: `  yishan workspace list --project-id <id>
  yishan workspace list --project-id <id> --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		verbose, err := cmd.Flags().GetBool("verbose")
		if err != nil {
			return err
		}
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}
		projects, err := loadLocalProjectWorkspaces(cmd.Context(), orgID)
		if err != nil {
			return err
		}
		response, projectNames := flattenLocalWorkspaces(projects, strings.TrimSpace(projectID))
		return output.PrintRenderData(renderWorkspacesList(response, verbose, strings.TrimSpace(projectID) == "", projectNames))
	},
}

var workspaceFindCmd = &cobra.Command{
	Use:   "find",
	Short: "Find workspace by project and workspace ID",
	Long:  `Look up a specific workspace by its ID within a project.`,
	Example: `  yishan workspace find --project-id <id> --workspace-id <id>
  yishan workspace find --project-id <id> --workspace-id <id> --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, projectID, workspaceID, err := workspaceRefFlags(cmd)
		if err != nil {
			return err
		}
		selected, err := findLocalWorkspace(cmd.Context(), orgID, projectID, workspaceID)
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{"workspace": selected, "organizationId": orgID, "projectId": projectID})
	},
}

var workspaceCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create project worktree",
	Long: `Create a new worktree workspace inside a project.

Primary workspaces are created only during project creation.

Examples:
  # Create a worktree workspace on a new branch
  yishan workspace create --project-id <id> --branch feature/foo --source-branch main`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		return runWorkspaceCreateViaDaemon(cmd)
	},
}

var workspaceCloseCmd = &cobra.Command{
	Use:     "close",
	Short:   "Close project workspace",
	Long:    `Close a workspace, stopping any associated processes and removing its worktree.`,
	Example: `  yishan workspace close --project-id <id> --workspace-id <id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, projectID, workspaceID, err := workspaceRefFlags(cmd)
		if err != nil {
			return err
		}
		if _, err := findLocalWorkspace(cmd.Context(), orgID, projectID, workspaceID); err != nil {
			return err
		}
		client, err := resolveDaemonClient()
		if err != nil {
			return err
		}
		var response any
		params := map[string]any{"workspaceId": workspaceID, "organizationId": orgID, "projectId": projectID}
		if err := client.Call(cmd.Context(), "workspace.close", params, &response); err != nil {
			return fmt.Errorf("failed to close workspace: %w", err)
		}
		return output.PrintAny(response)
	},
}

var workspaceCmd = &cobra.Command{
	Use:   "workspace",
	Short: "Workspace operations",
	Long:  `Create, list, find, and close workspaces within a Yishan project.`,
}

func init() {
	rootCmd.AddCommand(workspaceCmd)
	workspaceCmd.AddCommand(workspaceListCmd)
	workspaceCmd.AddCommand(workspaceFindCmd)
	workspaceCmd.AddCommand(workspaceCreateCmd)
	workspaceCmd.AddCommand(workspaceCloseCmd)

	addOrgIDFlag(workspaceListCmd)
	workspaceListCmd.Flags().BoolP("verbose", "v", false, "show full response fields")
	workspaceListCmd.Flags().String("project-id", "", "project ID (optional; if omitted, lists workspaces across all projects)")

	addOrgIDFlag(workspaceFindCmd)
	workspaceFindCmd.Flags().String("project-id", "", "project ID")
	workspaceFindCmd.Flags().String("workspace-id", "", "workspace ID")
	cobra.CheckErr(workspaceFindCmd.MarkFlagRequired("project-id"))
	cobra.CheckErr(workspaceFindCmd.MarkFlagRequired("workspace-id"))

	addOrgIDFlag(workspaceCreateCmd)
	workspaceCreateCmd.Flags().String("project-id", "", "project ID")
	workspaceCreateCmd.Flags().String("local-path", "", "deprecated: primary workspaces are created with projects")
	workspaceCreateCmd.Flags().String("kind", "worktree", "deprecated: workspace create only supports worktree")
	workspaceCreateCmd.Flags().String("branch", "", "branch name for worktree")
	workspaceCreateCmd.Flags().String("source-branch", "", "source branch for worktree")
	workspaceCreateCmd.Flags().String("name", "", "workspace name for worktree path")
	workspaceCreateCmd.Flags().String("task-run-prompt", "", "initial prompt for task run agent")
	workspaceCreateCmd.Flags().String("task-run-model", "", "model override for task run agent")
	cobra.CheckErr(workspaceCreateCmd.MarkFlagRequired("project-id"))
	cobra.CheckErr(workspaceCreateCmd.Flags().MarkHidden("local-path"))
	cobra.CheckErr(workspaceCreateCmd.Flags().MarkHidden("kind"))

	addOrgIDFlag(workspaceCloseCmd)
	workspaceCloseCmd.Flags().String("project-id", "", "project ID")
	workspaceCloseCmd.Flags().String("workspace-id", "", "workspace ID")
	cobra.CheckErr(workspaceCloseCmd.MarkFlagRequired("project-id"))
	cobra.CheckErr(workspaceCloseCmd.MarkFlagRequired("workspace-id"))
}

func validateWorkspaceKind(kind string) error {
	switch strings.TrimSpace(kind) {
	case string(workspace.KindWorktree):
		return nil
	case string(workspace.KindPrimary):
		return fmt.Errorf("workspace create only supports worktree workspaces; create a new project to create a primary workspace")
	default:
		return fmt.Errorf("invalid kind %q: expected worktree", kind)
	}
}

func buildTaskRunConfig(prompt, model string) *workspace.TaskRunConfig {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil
	}
	return &workspace.TaskRunConfig{
		Prompt: prompt,
		Model:  strings.TrimSpace(model),
	}
}
