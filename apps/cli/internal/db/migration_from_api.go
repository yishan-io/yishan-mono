package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rs/zerolog/log"
)

const (
	RemoteToLocalMigrationCompletedKey = "migration_remote_to_local_completed"
	RemoteToLocalMigrationVersion      = "v1"
)

// legacyRemoteToLocalMarkerKeys are the completion markers written by
// pre-consolidation migration schemes (the API-import era and the export-v1
// era). Current code never reads or writes them; the rows are deleted on every
// database open by cleanupLegacyMetadataKeys so old profiles converge on the
// single RemoteToLocalMigrationCompletedKey record.
var legacyRemoteToLocalMarkerKeys = []string{
	"migration_api_completed",
	"migration_usage_api_completed",
	"migration_projects_api_export_v1_completed",
	"migration_project_config_backfill_v1_completed",
	"migration_usage_api_export_v1_completed",
}

// legacyUsageMetadataKeys are the version-suffixed cost backfill markers and
// the legacy JSON import markers. Current code never reads or writes them;
// rows are deleted on every database open. The active backfill state lives in
// the single token_usage_cost_backfill_started_at / _completed records.
var legacyUsageMetadataKeys = []string{
	"token_usage_cost_backfill_v1_started_at",
	"token_usage_cost_backfill_v1_completed_at",
	"token_usage_cost_backfill_v2_started_at",
	"token_usage_cost_backfill_v2_completed_at",
	"token_usage_cost_backfill_v3_started_at",
	"token_usage_cost_backfill_v3_completed_at",
	"token_usage_cost_backfill_v4_started_at",
	"token_usage_cost_backfill_v4_completed_at",
	"token_usage_json_import_complete",
	"token_usage_json_backup_pending",
}

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
	TotalCostMicrosUSD    int64  `json:"totalCostMicrosUsd"`
	CostSource            string `json:"costSource"`
	EventCount            int64  `json:"eventCount"`
	SessionCount          int64  `json:"sessionCount"`
	TurnCount             int64  `json:"turnCount"`
	ToolCallCount         int64  `json:"toolCallCount"`
	AttributionConfidence string `json:"attributionConfidence"`
	IngestedAt            string `json:"ingestedAt"`
	RunID                 string `json:"runId"`
}

// MigrateRemoteToLocal imports projects, workspaces, and hourly usage from the
// remote API into the local database. It is the single remote-to-local
// migration entry point. Existing projects are backfilled from export data
// where legacy imports missed scripts, post hooks, command config, or the
// context-enabled setting; existing workspaces remain create-only. Completion
// is recorded as a single versioned metadata key: the migration re-runs
// (idempotently) when the key is absent or its version differs from
// RemoteToLocalMigrationVersion, and the key is written only when every step
// succeeds for every organization.
func MigrateRemoteToLocal(ctx context.Context, database *sql.DB, organizations []string, client APIClient) error {
	if !client.IsConfigured() {
		return nil
	}
	currentVersion, hasVersion, err := getMetadataKey(ctx, database, RemoteToLocalMigrationCompletedKey)
	if err != nil {
		return err
	}
	if hasVersion && currentVersion == RemoteToLocalMigrationVersion {
		return nil
	}
	if len(organizations) == 0 {
		return nil
	}

	store := NewHourlyUsageStore(database)
	allSucceeded := true
	for _, orgID := range organizations {
		if err := backfillProjectsFromExport(ctx, database, orgID, client); err != nil {
			allSucceeded = false
			log.Warn().Err(err).Str("orgId", orgID).Msg("project export backfill failed for org")
		}
		if err := exportWorkspacesFromAPI(ctx, database, orgID, client); err != nil {
			allSucceeded = false
			log.Warn().Err(err).Str("orgId", orgID).Msg("workspace export migration failed for org")
		}
		if err := migrateOrgUsage(ctx, store, client, orgID); err != nil {
			allSucceeded = false
			log.Warn().Err(err).Str("orgId", orgID).Msg("usage API migration failed for org")
		}
	}

	if allSucceeded {
		return setMetadataKey(ctx, database, RemoteToLocalMigrationCompletedKey, RemoteToLocalMigrationVersion)
	}
	return nil
}

// backfillProjectsFromExport upserts every exported project into the local
// database, restoring scripts, post hooks, command config, and the
// context-enabled setting on existing projects whose local record is strictly
// older than the remote export (local data is never overwritten). Per-project
// failures are logged and skipped; the first failure is returned so the overall
// migration marker stays unwritten.
func backfillProjectsFromExport(ctx context.Context, database *sql.DB, orgID string, client APIClient) error {
	projects, err := client.ExportProjects(ctx, orgID)
	if err != nil {
		return err
	}
	projectStore := NewProjectStore(database)
	var firstErr error
	for _, project := range projects {
		localProject := apiProjectToLocal(project)
		if err := projectStore.CreateOrBackfillImportedProject(ctx, &localProject); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			log.Warn().Err(err).Str("orgId", orgID).Str("projectId", project.ID).Msg("project export backfill failed for project")
		}
	}
	return firstErr
}

// exportWorkspacesFromAPI imports remote workspaces that do not exist locally,
// leaving existing workspaces untouched. Per-workspace failures are logged and
// skipped; the first failure is returned so the overall migration marker stays
// unwritten.
func exportWorkspacesFromAPI(ctx context.Context, database *sql.DB, orgID string, client APIClient) error {
	workspaces, err := client.ExportWorkspaces(ctx, orgID)
	if err != nil {
		return err
	}
	workspaceStore := NewWorkspaceStore(database)
	var firstErr error
	for _, workspace := range workspaces {
		_, getErr := workspaceStore.Get(ctx, workspace.ID)
		if getErr == nil {
			continue
		}
		if getErr != nil && !errors.Is(getErr, ErrWorkspaceNotFound) {
			if firstErr == nil {
				firstErr = getErr
			}
			log.Warn().Err(getErr).Str("orgId", orgID).Str("workspaceId", workspace.ID).Msg("workspace export migration lookup failed for workspace")
			continue
		}
		localWorkspace := apiWorkspaceToLocal(workspace)
		if err := workspaceStore.Create(ctx, &localWorkspace); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			log.Warn().Err(err).Str("orgId", orgID).Str("workspaceId", workspace.ID).Msg("workspace export migration failed for workspace")
		}
	}
	return firstErr
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

func getMetadataKey(ctx context.Context, database *sql.DB, key string) (string, bool, error) {
	var value string
	err := database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

// RemoteToLocalMigrationComplete reports whether any remote-to-local migration
// has completed. It is version-agnostic: an upgraded binary on a profile that
// migrated under an older version still reports complete while the background
// re-run bumps the version.
func RemoteToLocalMigrationComplete(ctx context.Context, database *sql.DB) (bool, error) {
	_, hasKey, err := getMetadataKey(ctx, database, RemoteToLocalMigrationCompletedKey)
	return hasKey, err
}

func cleanupLegacyMetadataKeys(database *sql.DB) error {
	for _, key := range append(append([]string{}, legacyRemoteToLocalMarkerKeys...), legacyUsageMetadataKeys...) {
		if _, err := database.Exec(`DELETE FROM _metadata WHERE key = ?`, key); err != nil {
			return fmt.Errorf("clean up legacy metadata key %q: %w", key, err)
		}
	}
	return nil
}

func setMetadataKey(ctx context.Context, database *sql.DB, key, value string) error {
	_, err := database.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
