package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/adapter/cloud"
)

// localProjectWorkspaces is one project with its live workspaces as the
// daemon's project.listWithWorkspaces returns them.
type localProjectWorkspaces struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Workspaces []cloud.Workspace `json:"workspaces"`
}

// loadLocalProjectWorkspaces reads this machine's projects and workspaces
// from the daemon, which owns them.
func loadLocalProjectWorkspaces(ctx context.Context, orgID string) ([]localProjectWorkspaces, error) {
	client, err := resolveDaemonClient()
	if err != nil {
		return nil, err
	}
	var projects []localProjectWorkspaces
	if err := client.Call(ctx, "project.listWithWorkspaces", map[string]any{"organizationId": orgID}, &projects); err != nil {
		return nil, fmt.Errorf("list workspaces from the daemon: %w", err)
	}
	return projects, nil
}

// flattenLocalWorkspaces collects the workspaces of every project, or of
// projectID only when it is set, with a project-name lookup.
func flattenLocalWorkspaces(projects []localProjectWorkspaces, projectID string) (cloud.ListWorkspacesResponse, map[string]string) {
	response := cloud.ListWorkspacesResponse{Workspaces: []cloud.Workspace{}}
	projectNames := make(map[string]string, len(projects))
	for _, project := range projects {
		projectNames[project.ID] = project.Name
		if projectID == "" || project.ID == projectID {
			response.Workspaces = append(response.Workspaces, project.Workspaces...)
		}
	}
	return response, projectNames
}

func findLocalWorkspace(ctx context.Context, orgID string, projectID string, workspaceID string) (cloud.Workspace, error) {
	projects, err := loadLocalProjectWorkspaces(ctx, orgID)
	if err != nil {
		return cloud.Workspace{}, err
	}
	response, _ := flattenLocalWorkspaces(projects, projectID)
	for _, item := range response.Workspaces {
		if item.ID == workspaceID {
			return item, nil
		}
	}
	return cloud.Workspace{}, fmt.Errorf("workspace %s was not found in project %s; run `yishan workspace list --project-id %s` to find a valid id", workspaceID, projectID, projectID)
}

func workspaceRefFlags(cmd *cobra.Command) (string, string, string, error) {
	orgID, err := resolveOrgID(cmd)
	if err != nil {
		return "", "", "", err
	}
	projectID, err := cmd.Flags().GetString("project-id")
	if err != nil {
		return "", "", "", err
	}
	workspaceID, err := cmd.Flags().GetString("workspace-id")
	return orgID, projectID, workspaceID, err
}
