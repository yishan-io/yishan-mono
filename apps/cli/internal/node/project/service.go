// Package project is the Node application service for the project.* RPC
// namespace: remote project listing with the host-local workspace runtime
// overlay, and per-organization list preferences. It receives a small
// dependency set and never imports the composition root or the daemon.
package project

import (
	"context"
	"database/sql"
	"strings"

	"yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"

	"github.com/rs/zerolog/log"
)

// Deps are the explicit dependencies of the project application service.
type Deps struct {
	// Runtime provides the cloud API client and auth state.
	Runtime *cliruntime.Runtime
	// Database provides the local workspace store for the runtime overlay.
	Database *sql.DB
}

// Service implements the project.* RPC namespace.
type Service struct {
	deps Deps

	// router is the namespace routing table for tests (callRPCForTest routes
	// through the same path rpc.Server uses for live connections). Production
	// composes the router in internal/app and leaves this nil.
	router *rpc.Router
}

// NewService builds the project application service.
func NewService(deps Deps) *Service {
	return &Service{deps: deps}
}

// projectWithWorkspaces is the project + live workspaces shape returned by
// project.listWithWorkspaces.
type projectWithWorkspaces struct {
	localdb.Project
	Workspaces []localdb.Workspace `json:"workspaces"`
}

func optionalString(value string) *string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}

func (s *Service) projectListPreferenceStore() *localdb.ProjectListPreferenceStore {
	return localdb.NewProjectListPreferenceStore(s.deps.Database)
}

// apiProjectToLocalRecord maps a remote project list record to the
// local-shaped record used by the RPC response.
func apiProjectToLocalRecord(project api.Project) localdb.Project {
	commands := make([]localdb.ProjectCommand, 0, len(project.Commands))
	for _, command := range project.Commands {
		commands = append(commands, localdb.ProjectCommand{Name: command.Name, Command: command.Command})
	}
	return localdb.Project{
		ID:              project.ID,
		Name:            project.Name,
		SourceType:      project.SourceType,
		RepoProvider:    optionalString(project.RepoProvider),
		RepoURL:         optionalString(project.RepoURL),
		RepoKey:         optionalString(project.RepoKey),
		Icon:            project.Icon,
		Color:           project.Color,
		SetupScript:     project.SetupScript,
		PostScript:      project.PostScript,
		Commands:        commands,
		ContextEnabled:  project.ContextEnabled,
		OrganizationID:  project.OrganizationID,
		CreatedByUserID: optionalString(project.CreatedByUserID),
		CreatedAt:       project.CreatedAt,
		UpdatedAt:       project.UpdatedAt,
	}
}

// apiWorkspaceToLocalRecord maps a remote workspace list record to the
// local-shaped record used by the RPC response. Runtime fields (state/health/
// localPath) are overlaid afterwards from the local store.
func apiWorkspaceToLocalRecord(workspace api.Workspace) localdb.Workspace {
	return localdb.Workspace{
		ID:             workspace.ID,
		OrganizationID: workspace.OrganizationID,
		ProjectID:      workspace.ProjectID,
		NodeID:         workspace.NodeID,
		Kind:           workspace.Kind,
		Status:         workspace.Status,
		Branch:         optionalString(workspace.Branch),
		SourceBranch:   optionalString(workspace.SourceBranch),
		LocalPath:      workspace.LocalPath,
		State:          "active",
	}
}

// listRemoteProjects fetches the org's projects from the remote list endpoint
// (org-scoped), mapped to the local-shaped records used by the RPC response.
func (s *Service) listRemote(ctx context.Context, orgID string) ([]localdb.Project, error) {
	response, err := s.deps.Runtime.APIClient().ListProjects(orgID)
	if err != nil {
		return nil, err
	}
	projects := make([]localdb.Project, 0, len(response.Projects))
	for _, project := range response.Projects {
		projects = append(projects, apiProjectToLocalRecord(project))
	}
	return projects, nil
}

// listRemoteWithWorkspaces fetches the org's projects together with the
// actor's live (non-closed) workspaces from the remote `withWorkspaces` list
// endpoint (one backend call), then overlays the host-local workspace runtime
// (state/health/localPath) from the local workspace store.
func (s *Service) listRemoteWithWorkspaces(ctx context.Context, orgID string) ([]projectWithWorkspaces, error) {
	response, err := s.deps.Runtime.APIClient().ListProjectsWithWorkspaces(orgID)
	if err != nil {
		return nil, err
	}

	runtimeByID := map[string]localdb.Workspace{}
	if s.deps.Database != nil {
		if local, err := localdb.NewWorkspaceStore(s.deps.Database).List(ctx); err == nil {
			for _, workspace := range local {
				runtimeByID[workspace.ID] = workspace
			}
		}
	}

	results := make([]projectWithWorkspaces, 0, len(response.Projects))
	for _, project := range response.Projects {
		workspaces := make([]localdb.Workspace, 0, len(project.Workspaces))
		for _, workspace := range project.Workspaces {
			record := apiWorkspaceToLocalRecord(workspace)
			if runtime, ok := runtimeByID[record.ID]; ok {
				// The local row is the authoritative lifecycle for the host: the
				// create flow flips it to active in FinalizePersisted before the
				// remote PATCH is attempted, so overlaying Status here keeps the
				// desktop from rendering a locally-completed workspace as still
				// provisioning when the remote record is stale (PATCH failed or
				// never ran).
				record.Status = runtime.Status
				record.State = runtime.State
				record.Health = runtime.Health
				record.LocalPath = runtime.LocalPath
			}
			workspaces = append(workspaces, record)
		}
		results = append(results, projectWithWorkspaces{Project: apiProjectToLocalRecord(project.Project), Workspaces: workspaces})
	}
	return results, nil
}

// ProjectList returns the org's projects from the remote API. There is no
// local project store anymore, so a failed/unconfigured remote read returns an
// empty list.
func (s *Service) List(ctx context.Context, req rpc.ProjectListParams) (any, error) {
	if s.deps.Runtime == nil || !s.deps.Runtime.APIConfigured() {
		return []localdb.Project{}, nil
	}
	projects, err := s.listRemote(ctx, req.OrganizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", req.OrganizationID).Msg("remote project list failed")
		return []localdb.Project{}, nil
	}
	return projects, nil
}

// ListWithWorkspaces returns the org's projects with the actor's
// live workspaces from the remote API, overlaying host-local runtime. There is
// no local project store anymore; a failed/unconfigured remote read returns an
// empty list.
func (s *Service) ListWithWorkspaces(ctx context.Context, req rpc.ProjectListWithWorkspacesParams) (any, error) {
	if s.deps.Runtime == nil || !s.deps.Runtime.APIConfigured() {
		return []projectWithWorkspaces{}, nil
	}
	results, err := s.listRemoteWithWorkspaces(ctx, req.OrganizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", req.OrganizationID).Msg("remote project list failed")
		return []projectWithWorkspaces{}, nil
	}
	return results, nil
}

func (s *Service) GetListPreferences(ctx context.Context, req rpc.ProjectGetListPreferencesParams) (any, error) {
	if strings.TrimSpace(req.OrganizationID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "organizationId is required")
	}
	return s.projectListPreferenceStore().Get(ctx, req.OrganizationID)
}

func (s *Service) SetListPreferences(ctx context.Context, req rpc.ProjectSetListPreferencesParams) (any, error) {
	if strings.TrimSpace(req.OrganizationID) == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "organizationId is required")
	}
	req.Preferences.Version = localdb.ProjectListPreferencesVersion
	if err := s.projectListPreferenceStore().Set(ctx, req.OrganizationID, req.Preferences); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}
