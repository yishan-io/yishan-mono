package cmd

import (
	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/adapter/cloud"
)

func renderWorkspacesList(response cloud.ListWorkspacesResponse, includeAll bool, includeProjectColumn bool, projectNames map[string]string) output.RenderData {
	rows := make([]map[string]any, 0, len(response.Workspaces))
	for _, workspace := range response.Workspaces {
		row := map[string]any{
			"id":        workspace.ID,
			"kind":      workspace.Kind,
			"branch":    workspace.Branch,
			"localPath": workspace.LocalPath,
		}
		if includeProjectColumn {
			if projectName, ok := projectNames[workspace.ProjectID]; ok && projectName != "" {
				row["project"] = projectName
			} else {
				row["project"] = workspace.ProjectID
			}
		}
		if includeAll {
			row["organizationId"] = workspace.OrganizationID
			row["projectId"] = workspace.ProjectID
			row["nodeId"] = workspace.NodeID
			row["createdAt"] = workspace.CreatedAt
			row["updatedAt"] = workspace.UpdatedAt
		}
		rows = append(rows, row)
	}

	columns := []string{"id", "kind", "branch", "localPath"}
	if includeProjectColumn {
		columns = []string{"id", "project", "kind", "branch", "localPath"}
	}
	if includeAll {
		columns = []string{"id", "kind", "branch", "localPath", "organizationId", "projectId", "nodeId", "createdAt", "updatedAt"}
	}

	return output.RenderData{Title: "workspaces", Columns: columns, Rows: rows}
}
