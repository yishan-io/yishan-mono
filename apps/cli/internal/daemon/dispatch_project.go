package daemon

import (
	"context"
	"encoding/json"
	"strings"

	"yishan/apps/cli/internal/api"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"

	"github.com/rs/zerolog/log"
)

// projectWithWorkspaces is the project + live workspaces shape returned by
// project.listWithWorkspaces.
type projectWithWorkspaces struct {
	localdb.Project
	Workspaces []localdb.Workspace `json:"workspaces"`
}

func optionalWorkspaceString(value string) *string {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return nil
	}
	return &trimmedValue
}

func (h *JSONRPCHandler) dispatchProject(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodProjectList:
		return h.handleProjectList(ctx, params)
	case MethodProjectListWithWkspaces:
		return h.handleProjectListWithWorkspaces(ctx, params)
	case MethodProjectGetListPreferences:
		return h.handleProjectGetListPreferences(ctx, params)
	case MethodProjectSetListPreferences:
		return h.handleProjectSetListPreferences(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown project method: "+method)
	}
}

func (h *JSONRPCHandler) projectListPreferenceStore() *localdb.ProjectListPreferenceStore {
	return localdb.NewProjectListPreferenceStore(h.localDatabase)
}

type projectListParams struct {
	OrganizationID string `json:"organizationId"`
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
		RepoProvider:    optionalWorkspaceString(project.RepoProvider),
		RepoURL:         optionalWorkspaceString(project.RepoURL),
		RepoKey:         optionalWorkspaceString(project.RepoKey),
		Icon:            project.Icon,
		Color:           project.Color,
		SetupScript:     project.SetupScript,
		PostScript:      project.PostScript,
		Commands:        commands,
		ContextEnabled:  project.ContextEnabled,
		OrganizationID:  project.OrganizationID,
		CreatedByUserID: optionalWorkspaceString(project.CreatedByUserID),
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
		Branch:         optionalWorkspaceString(workspace.Branch),
		SourceBranch:   optionalWorkspaceString(workspace.SourceBranch),
		LocalPath:      workspace.LocalPath,
		State:          "active",
	}
}

// listRemoteProjects fetches the org's projects from the remote list endpoint
// (org-scoped), mapped to the local-shaped records used by the RPC response.
func (h *JSONRPCHandler) listRemoteProjects(ctx context.Context, orgID string) ([]localdb.Project, error) {
	response, err := h.runtime.APIClient().ListProjects(orgID)
	if err != nil {
		return nil, err
	}
	projects := make([]localdb.Project, 0, len(response.Projects))
	for _, project := range response.Projects {
		projects = append(projects, apiProjectToLocalRecord(project))
	}
	return projects, nil
}

// listRemoteProjectsWithWorkspaces fetches the org's projects together with the
// actor's live (non-closed) workspaces from the remote `withWorkspaces` list
// endpoint (one backend call), then overlays the host-local workspace runtime
// (state/health/localPath) from the local workspace store.
func (h *JSONRPCHandler) listRemoteProjectsWithWorkspaces(ctx context.Context, orgID string) ([]projectWithWorkspaces, error) {
	response, err := h.runtime.APIClient().ListProjectsWithWorkspaces(orgID)
	if err != nil {
		return nil, err
	}

	runtimeByID := map[string]localdb.Workspace{}
	if h.localDatabase != nil {
		if local, err := localdb.NewWorkspaceStore(h.localDatabase).List(ctx); err == nil {
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
				// create flow flips it to active in finalizePersistedWorkspace
				// before the remote PATCH is attempted, so overlaying Status here
				// keeps the desktop from rendering a locally-completed workspace
				// as still provisioning when the remote record is stale (PATCH
				// failed or never ran).
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

// handleProjectList returns the org's projects from the remote API. There is no
// local project store anymore, so a failed/unconfigured remote read returns an
// empty list.
func (h *JSONRPCHandler) handleProjectList(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectListParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.runtime == nil || !h.runtime.APIConfigured() {
		return []localdb.Project{}, nil
	}
	projects, err := h.listRemoteProjects(ctx, req.OrganizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", req.OrganizationID).Msg("remote project list failed")
		return []localdb.Project{}, nil
	}
	return projects, nil
}

type projectListWithWorkspacesParams struct {
	OrganizationID string `json:"organizationId"`
}

// handleProjectListWithWorkspaces returns the org's projects with the actor's
// live workspaces from the remote API, overlaying host-local runtime. There is
// no local project store anymore; a failed/unconfigured remote read returns an
// empty list.
func (h *JSONRPCHandler) handleProjectListWithWorkspaces(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectListWithWorkspacesParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if h.runtime == nil || !h.runtime.APIConfigured() {
		return []projectWithWorkspaces{}, nil
	}
	results, err := h.listRemoteProjectsWithWorkspaces(ctx, req.OrganizationID)
	if err != nil {
		log.Warn().Err(err).Str("orgId", req.OrganizationID).Msg("remote project list failed")
		return []projectWithWorkspaces{}, nil
	}
	return results, nil
}

type projectGetListPreferencesParams struct {
	OrganizationID string `json:"organizationId"`
}

func (h *JSONRPCHandler) handleProjectGetListPreferences(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectGetListPreferencesParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.OrganizationID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "organizationId is required")
	}
	return h.projectListPreferenceStore().Get(ctx, req.OrganizationID)
}

type projectSetListPreferencesParams struct {
	OrganizationID string                        `json:"organizationId"`
	Preferences    localdb.ProjectListPreference `json:"preferences"`
}

func (h *JSONRPCHandler) handleProjectSetListPreferences(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectSetListPreferencesParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.OrganizationID) == "" {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, "organizationId is required")
	}
	req.Preferences.Version = localdb.ProjectListPreferencesVersion
	if err := h.projectListPreferenceStore().Set(ctx, req.OrganizationID, req.Preferences); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}
