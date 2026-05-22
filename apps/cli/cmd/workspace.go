package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	"yishan/apps/cli/internal/provision"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"

	"github.com/spf13/cobra"
)

var workspaceListCmd = &cobra.Command{
	Use:   "list",
	Short: "List project workspaces",
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().ListWorkspaces(orgID, projectID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var workspaceFindCmd = &cobra.Command{
	Use:   "find",
	Short: "Find workspace by project and workspace ID",
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
		workspaceID = strings.TrimSpace(workspaceID)
		if workspaceID == "" {
			return fmt.Errorf("workspace-id is required")
		}

		response, err := cliruntime.APIClient().ListWorkspaces(orgID, projectID)
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
	Short: "Create project workspace",
	Long: `Create a new workspace inside a project.

Workspace kinds:
  primary   A full checkout of the project. Requires --local-path.
  worktree  A git worktree branched from an existing primary workspace.
            Requires --branch. --source-branch defaults to the primary branch.

Examples:
  # Create a primary workspace at a local path
  yishan workspace create --project-id <id> --local-path /path/to/repo

  # Create a worktree workspace on a new branch
  yishan workspace create --project-id <id> --kind worktree --branch feature/foo`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		projectID, err := cmd.Flags().GetString("project-id")
		if err != nil {
			return err
		}
		localPath, err := cmd.Flags().GetString("local-path")
		if err != nil {
			return err
		}
		kind, err := cmd.Flags().GetString("kind")
		if err != nil {
			return err
		}
		branch, err := cmd.Flags().GetString("branch")
		if err != nil {
			return err
		}
		sourceBranch, err := cmd.Flags().GetString("source-branch")
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		if kind == workspace.KindPrimary && strings.TrimSpace(localPath) == "" {
			return fmt.Errorf("local-path is required for primary workspaces")
		}
		if err := validateWorkspaceKind(kind); err != nil {
			return err
		}

		provisioner := provision.NewRuntimeProvisioner(cliruntime.APIClient(), provision.RuntimeConfig{
			ConfigPath: appConfig.ConfigPath,
		})

		response, err := provisioner.CreateWorkspace(cmd.Context(), provision.CreateWorkspaceRequest{
			OrganizationID: orgID,
			ProjectID:      projectID,
			LocalPath:      localPath,
			Kind:           kind,
			Branch:         branch,
			SourceBranch:   sourceBranch,
			WorkspaceName:  name,
		})
		if err != nil {
			return formatWorkspaceLifecycleError("create", err)
		}

		return output.PrintAny(response)
	},
}

var workspaceCloseCmd = &cobra.Command{
	Use:   "close",
	Short: "Close project workspace",
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
		workspaceID = strings.TrimSpace(workspaceID)
		if workspaceID == "" {
			return fmt.Errorf("workspace-id is required")
		}

		workspaces, err := cliruntime.APIClient().ListWorkspaces(orgID, projectID)
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

		response, err := cliruntime.APIClient().CloseWorkspace(orgID, projectID, api.CloseWorkspaceInput{
			NodeID:    selected.NodeID,
			LocalPath: selected.LocalPath,
			Kind:      selected.Kind,
			Branch:    selected.Branch,
		})
		if err != nil {
			return formatWorkspaceLifecycleError("close", err)
		}

		return output.PrintAny(response)
	},
}

var workspaceCmd = &cobra.Command{Use: "workspace", Short: "Workspace operations"}

func init() {
	rootCmd.AddCommand(workspaceCmd)
	workspaceCmd.AddCommand(workspaceListCmd)
	workspaceCmd.AddCommand(workspaceFindCmd)
	workspaceCmd.AddCommand(workspaceCreateCmd)
	workspaceCmd.AddCommand(workspaceCloseCmd)

	addOrgIDFlag(workspaceListCmd)
	workspaceListCmd.Flags().String("project-id", "", "project ID")
	cobra.CheckErr(workspaceListCmd.MarkFlagRequired("project-id"))

	addOrgIDFlag(workspaceFindCmd)
	workspaceFindCmd.Flags().String("project-id", "", "project ID")
	workspaceFindCmd.Flags().String("workspace-id", "", "workspace ID")
	cobra.CheckErr(workspaceFindCmd.MarkFlagRequired("project-id"))
	cobra.CheckErr(workspaceFindCmd.MarkFlagRequired("workspace-id"))

	addOrgIDFlag(workspaceCreateCmd)
	workspaceCreateCmd.Flags().String("project-id", "", "project ID")
	workspaceCreateCmd.Flags().String("local-path", "", "local path")
	workspaceCreateCmd.Flags().String("kind", "primary", "workspace kind (primary|worktree)")
	workspaceCreateCmd.Flags().String("branch", "", "branch name for worktree")
	workspaceCreateCmd.Flags().String("source-branch", "", "source branch for worktree")
	workspaceCreateCmd.Flags().String("name", "", "workspace name for worktree path")
	cobra.CheckErr(workspaceCreateCmd.MarkFlagRequired("project-id"))

	addOrgIDFlag(workspaceCloseCmd)
	workspaceCloseCmd.Flags().String("project-id", "", "project ID")
	workspaceCloseCmd.Flags().String("workspace-id", "", "workspace ID")
	cobra.CheckErr(workspaceCloseCmd.MarkFlagRequired("project-id"))
	cobra.CheckErr(workspaceCloseCmd.MarkFlagRequired("workspace-id"))
}

func validateWorkspaceKind(kind string) error {
	switch strings.TrimSpace(kind) {
	case workspace.KindPrimary, workspace.KindWorktree:
		return nil
	default:
		return fmt.Errorf("invalid kind %q: expected primary or worktree", kind)
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
