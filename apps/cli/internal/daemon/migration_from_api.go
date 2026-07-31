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

func (client *daemonAPIClient) ExportProjects(ctx context.Context, orgID string) ([]localdb.APIProject, error) {
	projects, err := client.runtime.APIClient().ExportProjects(orgID)
	if err != nil {
		return nil, err
	}
	result := make([]localdb.APIProject, 0, len(projects))
	for _, project := range projects {
		result = append(result, localdb.APIProject{
			ID:             project.ID,
			Name:           project.Name,
			SourceType:     project.SourceType,
			RepoProvider:   project.RepoProvider,
			RepoURL:        project.RepoURL,
			RepoKey:        project.RepoKey,
			Icon:           project.Icon,
			Color:          project.Color,
			SetupScript:    project.SetupScript,
			PostScript:     project.PostScript,
			Commands:       toLocalProjectCommands(project.Commands),
			ContextEnabled: project.ContextEnabled,
			OrganizationID: project.OrganizationID,
			CreatedBy:      project.CreatedByUserID,
			CreatedAt:      project.CreatedAt,
			UpdatedAt:      project.UpdatedAt,
		})
	}
	return result, nil
}

func (client *daemonAPIClient) ExportWorkspaces(ctx context.Context, orgID string) ([]localdb.APIWorkspace, error) {
	workspaces, err := client.runtime.APIClient().ExportWorkspaces(orgID)
	if err != nil {
		return nil, err
	}
	result := make([]localdb.APIWorkspace, 0, len(workspaces))
	for _, workspace := range workspaces {
		result = append(result, localdb.APIWorkspace{
			ID:             workspace.ID,
			OrganizationID: workspace.OrganizationID,
			ProjectID:      workspace.ProjectID,
			NodeID:         workspace.NodeID,
			Kind:           workspace.Kind,
			Status:         workspace.Status,
			Branch:         workspace.Branch,
			SourceBranch:   workspace.SourceBranch,
			LocalPath:      workspace.LocalPath,
			CreatedAt:      workspace.CreatedAt,
			UpdatedAt:      workspace.UpdatedAt,
		})
	}
	return result, nil
}

func (client *daemonAPIClient) ExportHourlyUsage(ctx context.Context, orgID string) ([]localdb.APIHourlyUsageRow, error) {
	rows, err := client.runtime.APIClient().ExportTokenUsageHourly(orgID)
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

func toLocalProjectCommands(commands []api.ProjectCommand) []localdb.ProjectCommand {
	result := make([]localdb.ProjectCommand, 0, len(commands))
	for _, command := range commands {
		result = append(result, localdb.ProjectCommand{
			Name:    command.Name,
			Command: command.Command,
		})
	}
	return result
}
