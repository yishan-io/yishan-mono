package db

import (
	"context"
	"database/sql"
)

const migrationAPICompletedKey = "migration_api_completed"

// APIClient abstracts the remote datastore for first-launch project import.
type APIClient interface {
	ListProjects(ctx context.Context, orgID string) ([]APIProject, error)
	ListWorkspaces(ctx context.Context, orgID, projectID string) ([]APIWorkspace, error)
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

// MigrateFromAPI imports projects and workspaces from the remote API into the
// local database. It reads orgs from the API client and stores them locally.
// Already-stored projects and workspaces are skipped (idempotent).
func MigrateFromAPI(ctx context.Context, database *sql.DB, organizations []string, client APIClient) error {
	if !client.IsConfigured() {
		return nil
	}
	alreadyMigrated, err := metadataKeyExists(database, migrationAPICompletedKey)
	if err != nil {
		return err
	}
	if alreadyMigrated {
		return nil
	}
	if len(organizations) == 0 {
		return nil
	}
	projectStore := NewProjectStore(database)
	workspaceStore := NewWorkspaceStore(database)

	for _, orgID := range organizations {
		projects, err := client.ListProjects(ctx, orgID)
		if err != nil {
			continue // best-effort: skip failing organizations
		}
		for _, project := range projects {
			localProject := apiProjectToLocal(project)
			if err := projectStore.Create(ctx, &localProject); err != nil {
				continue // best-effort: skip individual project failures
			}
			workspaces, err := client.ListWorkspaces(ctx, orgID, project.ID)
			if err != nil {
				continue
			}
			for _, workspace := range workspaces {
				localWorkspace := apiWorkspaceToLocal(workspace)
				_ = workspaceStore.Create(ctx, &localWorkspace) // best-effort per-item import
			}
		}
	}
	return setMetadataKey(database, migrationAPICompletedKey, "true")
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

func metadataKeyExists(database *sql.DB, key string) (bool, error) {
	var foundValue string
	err := database.QueryRow(`SELECT value FROM _metadata WHERE key = ?`, key).Scan(&foundValue)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func setMetadataKey(database *sql.DB, key, value string) error {
	_, err := database.Exec(`INSERT INTO _metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
