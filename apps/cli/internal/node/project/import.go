package project

import (
	"context"
	"fmt"
	"strings"
	"time"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/sqlite"

	"github.com/rs/zerolog/log"
)

const importMarkerPrefix = "project_import_v1:"

const importTimeout = 20 * time.Second

// EnsureImported copies an organization's projects from api-service into the
// local store once. A project is imported when it belongs to this machine (it
// has a workspace here) or the current user created it. Offline or failed
// attempts leave no marker, so the next list retries. Import failures never
// fail the list: local rows are served either way.
func (s *Service) EnsureImported(ctx context.Context, organizationID string) {
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" || s.deps.Database == nil || !s.apiConfigured() {
		return
	}
	s.importMu.Lock()
	defer s.importMu.Unlock()
	markerKey := importMarkerPrefix + organizationID
	if done, err := sqlite.MetadataKeyExists(ctx, s.deps.Database, markerKey); err != nil || done {
		return
	}
	importCtx, cancel := context.WithTimeout(ctx, importTimeout)
	defer cancel()
	count, err := s.importOrganization(importCtx, organizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", organizationID).Msg("project import from api-service failed; will retry")
		return
	}
	if err := sqlite.SetMetadataKey(ctx, s.deps.Database, markerKey, time.Now().UTC().Format(time.RFC3339)); err != nil {
		log.Warn().Err(err).Str("orgId", organizationID).Msg("record project import marker failed")
		return
	}
	log.Info().Str("orgId", organizationID).Int("projects", count).Msg("imported projects from api-service")
}

func (s *Service) importOrganization(ctx context.Context, organizationID string) (int, error) {
	client := s.deps.Session.APIClient()
	me, err := client.WhoAmI()
	if err != nil {
		return 0, fmt.Errorf("resolve current user: %w", err)
	}
	response, err := client.ListProjectsWithWorkspacesContext(ctx, organizationID)
	if err != nil {
		return 0, fmt.Errorf("list remote projects: %w", err)
	}
	localProjectIDs, err := s.localWorkspaceProjectIDs(ctx)
	if err != nil {
		return 0, err
	}
	projects, primaries := s.selectImported(response.Projects, localProjectIDs, me.User.ID)
	if err := s.store().Import(ctx, projects, primaries); err != nil {
		return 0, fmt.Errorf("store imported projects: %w", err)
	}
	return len(projects), nil
}

// selectImported keeps the remote projects that belong to this machine and
// collects their primary workspace on this node.
func (s *Service) selectImported(remote []cloud.ProjectWithWorkspaces, localProjectIDs map[string]bool, userID string) ([]sqlite.Project, map[string]sqlite.PrimaryWorkspaceInput) {
	projects := make([]sqlite.Project, 0, len(remote))
	primaries := make(map[string]sqlite.PrimaryWorkspaceInput)
	for _, candidate := range remote {
		primary, hasPrimary := primaryOnNode(candidate.Workspaces, s.deps.NodeID)
		createdByMe := userID != "" && candidate.CreatedByUserID == userID
		if !hasPrimary && !localProjectIDs[candidate.ID] && !createdByMe {
			continue
		}
		projects = append(projects, remoteProjectToLocal(candidate.Project))
		if hasPrimary {
			primaries[candidate.ID] = primary
		}
	}
	return projects, primaries
}

func primaryOnNode(workspaces []cloud.Workspace, nodeID string) (sqlite.PrimaryWorkspaceInput, bool) {
	for _, workspace := range workspaces {
		if workspace.Kind == "primary" && workspace.NodeID == nodeID && strings.TrimSpace(workspace.LocalPath) != "" {
			return sqlite.PrimaryWorkspaceInput{ID: workspace.ID, NodeID: nodeID, LocalPath: workspace.LocalPath}, true
		}
	}
	return sqlite.PrimaryWorkspaceInput{}, false
}

func (s *Service) localWorkspaceProjectIDs(ctx context.Context) (map[string]bool, error) {
	workspaces, err := sqlite.NewWorkspaceStore(s.deps.Database).List(ctx)
	if err != nil {
		return nil, fmt.Errorf("list local workspaces: %w", err)
	}
	projectIDs := make(map[string]bool, len(workspaces))
	for _, workspace := range workspaces {
		if workspace.ProjectID != "" {
			projectIDs[workspace.ProjectID] = true
		}
	}
	return projectIDs, nil
}

// remoteProjectToLocal maps an api-service project to a synced local row.
func remoteProjectToLocal(project cloud.Project) sqlite.Project {
	commands := make([]sqlite.ProjectCommand, 0, len(project.Commands))
	for _, command := range project.Commands {
		commands = append(commands, sqlite.ProjectCommand{Name: command.Name, Command: command.Command})
	}
	return sqlite.Project{
		ID: project.ID, OrganizationID: project.OrganizationID, Name: project.Name,
		TaskPrefix: project.TaskPrefix, SourceType: project.SourceType,
		RepoProvider: optionalString(project.RepoProvider), RepoURL: optionalString(project.RepoURL),
		RepoKey: optionalString(project.RepoKey), Icon: project.Icon, Color: project.Color,
		SetupScript: project.SetupScript, PostScript: project.PostScript, Commands: commands,
		ContextEnabled: project.ContextEnabled, CreatedByUserID: optionalString(project.CreatedByUserID),
		CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt,
	}
}

func optionalString(value string) *string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}
