package db

import (
	"context"
	"database/sql"
	"errors"

	"github.com/rs/zerolog/log"
)

const (
	MigrationProjectsAPIExportV1CompletedKey     = "migration_projects_api_export_v1_completed"
	MigrationProjectConfigBackfillV1CompletedKey = "migration_project_config_backfill_v1_completed"
	legacyMigrationAPICompletedKey               = "migration_api_completed"
	legacyMigrationUsageAPICompletedKey          = "migration_usage_api_completed"
)

// APIClient abstracts the remote datastore for first-launch project import.
type APIClient interface {
	ExportProjects(ctx context.Context, orgID string) ([]APIProject, error)
	ExportWorkspaces(ctx context.Context, orgID string) ([]APIWorkspace, error)
	ExportHourlyUsage(ctx context.Context, orgID string) ([]APIHourlyUsageRow, error)
	IsConfigured() bool
}

// APIProject is the remote project record needed for local import.
type APIProject struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	SourceType     string           `json:"sourceType"`
	RepoProvider   *string          `json:"repoProvider"`
	RepoURL        *string          `json:"repoUrl"`
	RepoKey        *string          `json:"repoKey"`
	Icon           string           `json:"icon"`
	Color          string           `json:"color"`
	SetupScript    string           `json:"setupScript"`
	PostScript     string           `json:"postScript"`
	Commands       []ProjectCommand `json:"commands"`
	ContextEnabled bool             `json:"contextEnabled"`
	OrganizationID string           `json:"organizationId"`
	CreatedBy      *string          `json:"createdByUserId"`
	CreatedAt      string           `json:"createdAt"`
	UpdatedAt      string           `json:"updatedAt"`
}

// APIWorkspace is the remote workspace record needed for local import.
type APIWorkspace struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      string  `json:"projectId"`
	NodeID         string  `json:"nodeId"`
	Kind           string  `json:"kind"`
	Status         string  `json:"status"`
	Branch         *string `json:"branch"`
	SourceBranch   *string `json:"sourceBranch"`
	LocalPath      string  `json:"localPath"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

// APIHourlyUsageRow is the remote hourly usage row needed for local import.
type APIHourlyUsageRow struct {
	ProjectID             string `json:"projectId"`
	WorkspaceID           string `json:"workspaceId"`
	WorkspacePath         string `json:"workspacePath"`
	OrganizationID        string `json:"organizationId"`
	AgentKind             string `json:"agentKind"`
	Model                 string `json:"model"`
	ModelNormalized       string `json:"modelNormalized"`
	BucketStartHourUTC    string `json:"bucketStartHourUtc"`
	InputTokens           int64  `json:"inputTokens"`
	OutputTokens          int64  `json:"outputTokens"`
	CachedInputTokens     int64  `json:"cachedInputTokens"`
	CachedWriteTokens     int64  `json:"cachedWriteTokens"`
	ReasoningTokens       int64  `json:"reasoningTokens"`
	TotalTokens           int64  `json:"totalTokens"`
	EventCount            int64  `json:"eventCount"`
	SessionCount          int64  `json:"sessionCount"`
	TurnCount             int64  `json:"turnCount"`
	ToolCallCount         int64  `json:"toolCallCount"`
	AttributionConfidence string `json:"attributionConfidence"`
	IngestedAt            string `json:"ingestedAt"`
	RunID                 string `json:"runId"`
}

// MigrateFromAPI imports projects and workspaces from the remote API into the
// local database. It reads orgs from the API client and stores them locally.
// Existing projects are backfilled from export data where legacy imports missed
// scripts, post hooks, command config, or the context-enabled setting; existing
// workspaces remain create-only.
func MigrateFromAPI(ctx context.Context, database *sql.DB, organizations []string, client APIClient) error {
	if !client.IsConfigured() {
		return nil
	}
	workspaceMigrationCompleted, err := MetadataKeyExists(ctx, database, MigrationProjectsAPIExportV1CompletedKey)
	if err != nil {
		return err
	}
	projectConfigBackfillCompleted, err := MetadataKeyExists(ctx, database, MigrationProjectConfigBackfillV1CompletedKey)
	if err != nil {
		return err
	}
	if workspaceMigrationCompleted && projectConfigBackfillCompleted {
		return nil
	}
	if len(organizations) == 0 {
		return nil
	}
	projectStore := NewProjectStore(database)
	workspaceStore := NewWorkspaceStore(database)

	projectBackfillSucceeded := true
	workspaceMigrationSucceeded := true
	for _, orgID := range organizations {
		if !projectConfigBackfillCompleted {
			projects, exportErr := client.ExportProjects(ctx, orgID)
			if exportErr != nil {
				projectBackfillSucceeded = false
				log.Warn().Err(exportErr).Str("orgId", orgID).Msg("project export backfill failed for org")
			} else {
				for _, project := range projects {
					localProject := apiProjectToLocal(project)
					if err := projectStore.CreateOrBackfillImportedProject(ctx, &localProject); err != nil {
						projectBackfillSucceeded = false
						log.Warn().Err(err).Str("orgId", orgID).Str("projectId", project.ID).Msg("project export backfill failed for project")
					}
				}
			}
		}
		if workspaceMigrationCompleted {
			continue
		}
		workspaces, exportErr := client.ExportWorkspaces(ctx, orgID)
		if exportErr != nil {
			workspaceMigrationSucceeded = false
			log.Warn().Err(exportErr).Str("orgId", orgID).Msg("workspace export migration failed for org")
			continue
		}
		for _, workspace := range workspaces {
			_, getErr := workspaceStore.Get(ctx, workspace.ID)
			if getErr == nil {
				continue
			}
			if getErr != nil && !errors.Is(getErr, ErrWorkspaceNotFound) {
				workspaceMigrationSucceeded = false
				log.Warn().Err(getErr).Str("orgId", orgID).Str("workspaceId", workspace.ID).Msg("workspace export migration lookup failed for workspace")
				continue
			}
			localWorkspace := apiWorkspaceToLocal(workspace)
			if err := workspaceStore.Create(ctx, &localWorkspace); err != nil {
				workspaceMigrationSucceeded = false
				log.Warn().Err(err).Str("orgId", orgID).Str("workspaceId", workspace.ID).Msg("workspace export migration failed for workspace")
			}
		}
	}

	if !workspaceMigrationCompleted && workspaceMigrationSucceeded {
		if err := setMetadataKey(ctx, database, MigrationProjectsAPIExportV1CompletedKey, "true"); err != nil {
			return err
		}
	}
	if !projectConfigBackfillCompleted && projectBackfillSucceeded {
		if err := setMetadataKey(ctx, database, MigrationProjectConfigBackfillV1CompletedKey, "true"); err != nil {
			return err
		}
	}
	return nil
}

func apiProjectToLocal(project APIProject) Project {
	commands := project.Commands
	if commands == nil {
		commands = []ProjectCommand{}
	}
	return Project{
		ID:              project.ID,
		Name:            project.Name,
		SourceType:      project.SourceType,
		RepoProvider:    project.RepoProvider,
		RepoURL:         project.RepoURL,
		RepoKey:         project.RepoKey,
		Icon:            project.Icon,
		Color:           project.Color,
		SetupScript:     project.SetupScript,
		PostScript:      project.PostScript,
		Commands:        commands,
		ContextEnabled:  project.ContextEnabled,
		OrganizationID:  project.OrganizationID,
		CreatedByUserID: project.CreatedBy,
		CreatedAt:       project.CreatedAt,
		UpdatedAt:       project.UpdatedAt,
	}
}

func apiWorkspaceToLocal(workspace APIWorkspace) Workspace {
	return Workspace{
		ID:             workspace.ID,
		OrganizationID: workspace.OrganizationID,
		ProjectID:      workspace.ProjectID,
		NodeID:         workspace.NodeID,
		Kind:           workspace.Kind,
		Status:         workspace.Status,
		Branch:         workspace.Branch,
		SourceBranch:   workspace.SourceBranch,
		LocalPath:      workspace.LocalPath,
		State:          "active",
		CreatedAt:      workspace.CreatedAt,
		UpdatedAt:      workspace.UpdatedAt,
	}
}

func MetadataKeyExists(ctx context.Context, database *sql.DB, key string) (bool, error) {
	var foundValue string
	err := database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, key).Scan(&foundValue)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func ProjectMigrationStatusComplete(ctx context.Context, database *sql.DB) (bool, error) {
	return metadataKeyExistsAny(ctx, database, MigrationProjectsAPIExportV1CompletedKey, legacyMigrationAPICompletedKey)
}

func UsageMigrationStatusComplete(ctx context.Context, database *sql.DB) (bool, error) {
	return metadataKeyExistsAny(ctx, database, MigrationUsageAPIExportV1CompletedKey, legacyMigrationUsageAPICompletedKey)
}

func ProjectExportV1MigrationComplete(ctx context.Context, database *sql.DB) (bool, error) {
	return MetadataKeyExists(ctx, database, MigrationProjectsAPIExportV1CompletedKey)
}

func UsageExportV1MigrationComplete(ctx context.Context, database *sql.DB) (bool, error) {
	return MetadataKeyExists(ctx, database, MigrationUsageAPIExportV1CompletedKey)
}

func metadataKeyExistsAny(ctx context.Context, database *sql.DB, keys ...string) (bool, error) {
	for _, key := range keys {
		exists, err := MetadataKeyExists(ctx, database, key)
		if err != nil {
			return false, err
		}
		if exists {
			return true, nil
		}
	}
	return false, nil
}

func setMetadataKey(ctx context.Context, database *sql.DB, key, value string) error {
	_, err := database.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
