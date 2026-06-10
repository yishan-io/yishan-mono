package cmd

import (
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
)

func renderProjectsList(response api.ListProjectsResponse, includeAll bool) output.RenderData {
	rows := make([]map[string]any, 0, len(response.Projects))
	for _, project := range response.Projects {
		row := map[string]any{
			"id":   project.ID,
			"name": project.Name,
		}
		if includeAll {
			row["organizationId"] = project.OrganizationID
			row["nodeId"] = project.NodeID
			row["sourceType"] = project.SourceType
			row["repoProvider"] = project.RepoProvider
			row["repoUrl"] = project.RepoURL
			row["repoKey"] = project.RepoKey
			row["contextEnabled"] = project.ContextEnabled
			row["setupScript"] = project.SetupScript
			row["postScript"] = project.PostScript
			row["createdAt"] = project.CreatedAt
			row["updatedAt"] = project.UpdatedAt
		}
		rows = append(rows, row)
	}

	columns := []string{"id", "name"}
	if includeAll {
		columns = []string{"id", "name", "organizationId", "nodeId", "sourceType", "repoProvider", "repoUrl", "repoKey", "contextEnabled", "setupScript", "postScript", "createdAt", "updatedAt"}
	}

	return output.RenderData{Title: "projects", Columns: columns, Rows: rows}
}

func renderNodesList(response api.ListNodesResponse, includeAll bool) output.RenderData {
	rows := make([]map[string]any, 0, len(response.Nodes))
	for _, node := range response.Nodes {
		row := map[string]any{
			"id":    node.ID,
			"name":  node.Name,
			"scope": node.Scope,
		}
		if includeAll {
			row["organizationId"] = node.OrganizationID
			row["endpoint"] = node.Endpoint
			row["metadata"] = node.Metadata
			row["createdAt"] = node.CreatedAt
			row["updatedAt"] = node.UpdatedAt
		}
		rows = append(rows, row)
	}

	columns := []string{"id", "name", "scope"}
	if includeAll {
		columns = []string{"id", "name", "scope", "organizationId", "endpoint", "metadata", "createdAt", "updatedAt"}
	}

	return output.RenderData{Title: "nodes", Columns: columns, Rows: rows}
}

func renderWorkspacesList(response api.ListWorkspacesResponse, includeAll bool, includeProjectColumn bool, projectNames map[string]string) output.RenderData {
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
