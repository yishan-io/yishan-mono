package daemon

import (
	"context"

	"yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	cliruntime "yishan/apps/cli/internal/runtime"
)

// daemonAPIClient adapts the daemon's runtime to the local DB migration interface.
type daemonAPIClient struct {
	runtime *cliruntime.Runtime
}

func (client *daemonAPIClient) IsConfigured() bool {
	return client.runtime != nil && client.runtime.APIConfigured()
}

func (client *daemonAPIClient) ListProjects(ctx context.Context, orgID string) ([]localdb.APIProject, error) {
	response, err := client.runtime.APIClient().ListProjects(orgID)
	if err != nil {
		return nil, err
	}
	projects := make([]localdb.APIProject, 0, len(response.Projects))
	for _, project := range response.Projects {
		projects = append(projects, localdb.APIProject{
			ID:             project.ID,
			Name:           project.Name,
			SourceType:     project.SourceType,
			RepoProvider:   strPtr(project.RepoProvider),
			RepoURL:        strPtr(project.RepoURL),
			RepoKey:        strPtr(project.RepoKey),
			OrganizationID: project.OrganizationID,
			CreatedAt:      project.CreatedAt,
			UpdatedAt:      project.UpdatedAt,
		})
	}
	return projects, nil
}

func (client *daemonAPIClient) ListWorkspaces(ctx context.Context, orgID, projectID string) ([]localdb.APIWorkspace, error) {
	response, err := client.runtime.APIClient().ListWorkspaces(orgID, projectID)
	if err != nil {
		return nil, err
	}
	workspaces := make([]localdb.APIWorkspace, 0, len(response.Workspaces))
	for _, workspace := range response.Workspaces {
		workspaces = append(workspaces, localdb.APIWorkspace{
			ID:             workspace.ID,
			OrganizationID: workspace.OrganizationID,
			ProjectID:      workspace.ProjectID,
			NodeID:         workspace.NodeID,
			Kind:           workspace.Kind,
			Status:         workspace.Status,
			Branch:         strPtr(workspace.Branch),
			SourceBranch:   strPtr(workspace.SourceBranch),
			LocalPath:      workspace.LocalPath,
			CreatedAt:      workspace.CreatedAt,
			UpdatedAt:      workspace.UpdatedAt,
		})
	}
	return workspaces, nil
}

func (client *daemonAPIClient) ListHourlyUsage(ctx context.Context, orgID string, limit int) ([]localdb.APIHourlyUsageRow, error) {
	input := api.ListTokenUsageHourlyInput{Limit: limit}
	rows, err := client.runtime.APIClient().ListTokenUsageHourly(orgID, input)
	if err != nil {
		return nil, err
	}
	result := make([]localdb.APIHourlyUsageRow, 0, len(rows))
	for _, row := range rows {
		result = append(result, localdb.APIHourlyUsageRow{
			ProjectID:             row.ProjectID,
			WorkspaceID:           row.WorkspaceID,
			WorkspacePath:         row.WorkspacePath,
			OrganizationID:        row.OrganizationID,
			AgentKind:             row.AgentKind,
			Model:                 row.Model,
			ModelNormalized:       row.ModelNormalized,
			BucketStartHourUTC:    row.BucketStartHourUTC,
			InputTokens:           row.InputTokens,
			OutputTokens:          row.OutputTokens,
			CachedInputTokens:     row.CachedInputTokens,
			CachedWriteTokens:     row.CachedWriteTokens,
			ReasoningTokens:       row.ReasoningTokens,
			TotalTokens:           row.TotalTokens,
			EventCount:            row.EventCount,
			SessionCount:          row.SessionCount,
			TurnCount:             row.TurnCount,
			ToolCallCount:         row.ToolCallCount,
			AttributionConfidence: row.AttributionConfidence,
			IngestedAt:            row.IngestedAt,
			RunID:                 row.RunID,
		})
	}
	return result, nil
}

func strPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
