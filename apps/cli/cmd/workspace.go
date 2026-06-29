package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	"yishan/apps/cli/internal/workspace"

	"github.com/spf13/cobra"
)

var workspaceListCmd = &cobra.Command{
	Use:   "list",
	Short: "List project workspaces",
	Long:  `List all workspaces belonging to a project.`,
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

		response := api.ListWorkspacesResponse{Workspaces: []api.Workspace{}}
		projectNames := map[string]string{}
		if strings.TrimSpace(projectID) != "" {
			response, err = apiClient.ListWorkspaces(orgID, projectID)
			if err != nil {
				return err
			}
			return output.PrintRenderData(renderWorkspacesList(response, verbose, false, projectNames))
		}

		projectsResponse, err := apiClient.ListProjects(orgID)
		if err != nil {
			return err
		}

		for _, project := range projectsResponse.Projects {
			projectNames[project.ID] = project.Name
			projectWorkspaces, projectErr := apiClient.ListWorkspaces(orgID, project.ID)
			if projectErr != nil {
				return projectErr
			}
			response.Workspaces = append(response.Workspaces, projectWorkspaces.Workspaces...)
		}

		return output.PrintRenderData(renderWorkspacesList(response, verbose, true, projectNames))
	},
}

var workspaceFindCmd = &cobra.Command{
	Use:   "find",
	Short: "Find workspace by project and workspace ID",
	Long:  `Look up a specific workspace by its ID within a project.`,
	Example: `  yishan workspace find --project-id <id> --workspace-id <id>
  yishan workspace find --project-id <id> --workspace-id <id> --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}
		workspaceID, err := cmd.Flags().GetString("workspace-id")
		if err != nil {
			return err
		}

		response, err := apiClient.ListWorkspaces(orgID, projectID)
		if err != nil {
			return formatWorkspaceLifecycleError("get", err)
		}

		for i := range response.Workspaces {
			item := response.Workspaces[i]
			if item.ID == workspaceID {
				return output.PrintAny(map[string]any{
					"workspace":      item,
					"organizationId": orgID,
					"projectId":      projectID,
				})
			}
		}

		return fmt.Errorf("workspace %s was not found in project %s; run `yishan workspace list --project-id %s` to find a valid id", workspaceID, projectID, projectID)
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
	Long:    `Close a workspace, stopping any associated processes and releasing compute resources.`,
	Example: `  yishan workspace close --project-id <id> --workspace-id <id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}
		workspaceID, err := cmd.Flags().GetString("workspace-id")
		if err != nil {
			return err
		}

		workspaces, err := apiClient.ListWorkspaces(orgID, projectID)
		if err != nil {
			return formatWorkspaceLifecycleError("close", err)
		}

		var selected *api.Workspace
		for i := range workspaces.Workspaces {
			item := &workspaces.Workspaces[i]
			if item.ID == workspaceID {
				selected = item
				break
			}
		}
		if selected == nil {
			return fmt.Errorf("workspace %s was not found in project %s; run `yishan workspace list --project-id %s` to find a valid id", workspaceID, projectID, projectID)
		}

		response, err := apiClient.CloseWorkspace(orgID, projectID, api.CloseWorkspaceInput{
			WorkspaceID: selected.ID,
		})
		if err != nil {
			return formatWorkspaceLifecycleError("close", err)
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
	workspaceCreateCmd.Flags().String("target-node", "", "target node ID (defaults to local daemon node)")
	workspaceCreateCmd.Flags().String("name", "", "workspace name for worktree path")
	workspaceCreateCmd.Flags().String("task-run-agent-kind", "", "agent kind for init task run (e.g. opencode)")
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
	case workspace.KindWorktree:
		return nil
	case workspace.KindPrimary:
		return fmt.Errorf("workspace create only supports worktree workspaces; create a new project to create a primary workspace")
	default:
		return fmt.Errorf("invalid kind %q: expected worktree", kind)
	}
}

func formatWorkspaceLifecycleError(action string, err error) error {
	var apiErr *api.APIError
	if !errors.As(err, &apiErr) {
		return err
	}

	message := strings.TrimSpace(extractAPIErrorMessage(apiErr.Body))
	if message == "" {
		message = strings.TrimSpace(apiErr.Status)
	}

	switch apiErr.StatusCode {
	case http.StatusBadRequest:
		return fmt.Errorf("failed to %s workspace: invalid input. %s", action, message)
	case http.StatusForbidden:
		return fmt.Errorf("failed to %s workspace: permission denied. Verify your organization role and project access", action)
	case http.StatusNotFound:
		return fmt.Errorf("failed to %s workspace: resource not found. %s", action, message)
	default:
		if message != "" {
			return fmt.Errorf("failed to %s workspace: %s", action, message)
		}
		return err
	}
}

func extractAPIErrorMessage(body []byte) string {
	if len(body) == 0 {
		return ""
	}

	payload := map[string]any{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}

	for _, key := range []string{"message", "error", "details"} {
		if value, ok := payload[key]; ok {
			if text := strings.TrimSpace(fmt.Sprint(value)); text != "" {
				return text
			}
		}
	}

	return ""
}

func buildTaskRunConfig(agentKind, prompt, model string) *workspace.TaskRunConfig {
	agentKind = strings.TrimSpace(agentKind)
	prompt = strings.TrimSpace(prompt)
	if agentKind == "" || prompt == "" {
		return nil
	}
	if agentKind == "opencode" && openCodeSkillsInstalled() {
		prompt = "/ys-start " + prompt
	}
	return &workspace.TaskRunConfig{
		AgentKind: agentKind,
		Prompt:    prompt,
		Model:     strings.TrimSpace(model),
	}
}

func openCodeSkillsInstalled() bool {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(homeDir, ".config")
	}
	startSkillPath := filepath.Join(configHome, "opencode", "skills", "ys-start")
	info, err := os.Stat(startSkillPath)
	return err == nil && info.IsDir()
}
