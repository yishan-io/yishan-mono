package daemon

import (
	"context"
	"encoding/json"
	"strings"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchProject(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodProjectList:
		return h.handleProjectList(ctx, params)
	case MethodProjectGet:
		return h.handleProjectGet(ctx, params)
	case MethodProjectCreate:
		return h.handleProjectCreate(ctx, params)
	case MethodProjectUpdate:
		return h.handleProjectUpdate(ctx, params)
	case MethodProjectDelete:
		return h.handleProjectDelete(ctx, params)
	case MethodProjectListWithWkspaces:
		return h.handleProjectListWithWorkspaces(ctx, params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown project method: "+method)
	}
}

func (h *JSONRPCHandler) projectStore() *localdb.ProjectStore {
	return localdb.NewProjectStore(h.localDatabase)
}

type projectListParams struct {
	OrganizationID string `json:"organizationId"`
}

func (h *JSONRPCHandler) handleProjectList(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectListParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	return h.projectStore().ListByOrg(ctx, req.OrganizationID)
}

type projectGetParams struct {
	ID string `json:"id"`
}

func (h *JSONRPCHandler) handleProjectGet(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectGetParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	return h.projectStore().Get(ctx, req.ID)
}

type projectCreateParams struct {
	Name           string                   `json:"name"`
	OrganizationID string                   `json:"organizationId"`
	RepoURL        *string                  `json:"repoUrl,omitempty"`
	SourceType     string                   `json:"sourceType,omitempty"`
	Commands       []localdb.ProjectCommand `json:"commands,omitempty"`
	NodeID         string                   `json:"nodeId,omitempty"`
	LocalPath      string                   `json:"localPath,omitempty"`
	ContextEnabled *bool                    `json:"contextEnabled,omitempty"`
}

func (h *JSONRPCHandler) handleProjectCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	// Mirror the api-service default: context is enabled unless explicitly
	// disabled. The Go zero value would otherwise make every desktop-created
	// project start with context off and skip the create-time context sync.
	contextEnabled := true
	if req.ContextEnabled != nil {
		contextEnabled = *req.ContextEnabled
	}
	project := &localdb.Project{
		Name:           req.Name,
		OrganizationID: req.OrganizationID,
		SourceType:     req.SourceType,
		RepoURL:        req.RepoURL,
		Commands:       req.Commands,
		ContextEnabled: contextEnabled,
	}
	if err := h.projectStore().Create(ctx, project); err != nil {
		return nil, err
	}

	// A local-folder project (git-local or non-git) gets its single primary
	// workspace row here, mirroring the api-service contract: the project
	// folder itself is the primary workspace, persisted so snapshot reloads
	// and daemon restarts keep it visible and openable.
	workspaces := make([]localdb.Workspace, 0)
	nodeID := strings.TrimSpace(req.NodeID)
	localPath := strings.TrimSpace(req.LocalPath)
	if nodeID != "" && localPath != "" && h.localDatabase != nil {
		workspaceRecord := &localdb.Workspace{
			OrganizationID: req.OrganizationID,
			ProjectID:      project.ID,
			NodeID:         nodeID,
			Kind:           workspace.KindPrimary,
			Status:         "active",
			LocalPath:      localPath,
			State:          workspace.WorkspaceStateActive,
		}
		if err := localdb.NewWorkspaceStore(h.localDatabase).Create(ctx, workspaceRecord); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, *workspaceRecord)
	}

	type projectWithWorkspaces struct {
		localdb.Project
		Workspaces []localdb.Workspace `json:"workspaces"`
	}
	return projectWithWorkspaces{Project: *project, Workspaces: workspaces}, nil
}

type projectUpdateParams struct {
	ID             string                    `json:"id"`
	Name           *string                   `json:"name,omitempty"`
	Icon           *string                   `json:"icon,omitempty"`
	Color          *string                   `json:"color,omitempty"`
	SetupScript    *string                   `json:"setupScript,omitempty"`
	PostScript     *string                   `json:"postScript,omitempty"`
	Commands       *[]localdb.ProjectCommand `json:"commands,omitempty"`
	ContextEnabled *bool                     `json:"contextEnabled,omitempty"`
}

func (h *JSONRPCHandler) handleProjectUpdate(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectUpdateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	update := localdb.ProjectUpdate{
		Name:           req.Name,
		Icon:           req.Icon,
		Color:          req.Color,
		SetupScript:    req.SetupScript,
		PostScript:     req.PostScript,
		Commands:       req.Commands,
		ContextEnabled: req.ContextEnabled,
	}
	if err := h.projectStore().Update(ctx, req.ID, update); err != nil {
		return nil, err
	}
	return h.projectStore().Get(ctx, req.ID)
}

type projectDeleteParams struct {
	ID string `json:"id"`
}

func (h *JSONRPCHandler) handleProjectDelete(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectDeleteParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if err := h.projectStore().Delete(ctx, req.ID); err != nil {
		return nil, err
	}
	return map[string]bool{"ok": true}, nil
}

type projectListWithWorkspacesParams struct {
	OrganizationID string `json:"organizationId"`
}

func (h *JSONRPCHandler) handleProjectListWithWorkspaces(ctx context.Context, params json.RawMessage) (any, error) {
	var req projectListWithWorkspacesParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	projects, err := h.projectStore().ListByOrg(ctx, req.OrganizationID)
	if err != nil {
		return nil, err
	}
	workspaceStore := localdb.NewWorkspaceStore(h.localDatabase)
	type projectWithWorkspaces struct {
		localdb.Project
		Workspaces []localdb.Workspace `json:"workspaces"`
	}
	results := make([]projectWithWorkspaces, 0, len(projects))
	for _, project := range projects {
		workspaces, err := workspaceStore.ListLiveByProject(ctx, project.ID)
		if err != nil {
			return nil, err
		}
		results = append(results, projectWithWorkspaces{Project: project, Workspaces: workspaces})
	}
	return results, nil
}
