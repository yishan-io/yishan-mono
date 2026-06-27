package daemon

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/api"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

const (
	workspaceRelayChangeCreateRequest   = "workspace.create.request"
	workspaceRelayChangeCreateProgress  = "workspace.create.progress"
	workspaceRelayChangeCreateCompleted = "workspace.create.completed"
	workspaceRelayChangeCreateFailed    = "workspace.create.failed"
)

type workspaceCreateParams struct {
	ID             string                   `json:"id,omitempty"`
	OrganizationID string                   `json:"organizationId,omitempty"`
	NodeID         string                   `json:"nodeId,omitempty"`
	ProjectID      string                   `json:"projectId,omitempty"`
	RepoKey        string                   `json:"repoKey,omitempty"`
	WorkspaceName  string                   `json:"workspaceName,omitempty"`
	SourcePath     string                   `json:"sourcePath,omitempty"`
	TargetBranch   string                   `json:"targetBranch,omitempty"`
	SourceBranch   string                   `json:"sourceBranch,omitempty"`
	ContextEnabled bool                     `json:"contextEnabled,omitempty"`
	SetupHook      string                   `json:"setupHook,omitempty"`
	TaskRun        *workspace.TaskRunConfig `json:"taskRun,omitempty"`
	LocalPath      string                   `json:"localPath,omitempty"`
	Kind           string                   `json:"kind,omitempty"`
	Branch         string                   `json:"branch,omitempty"`
	ReplyNodeID    string                   `json:"replyNodeId,omitempty"`
}

type preparedWorkspaceCreate struct {
	workspaceID      string
	organizationID   string
	projectID        string
	startedEvent     workspaceCreateStartedEvent
	relayReplyNodeID string
	localCreate      *workspace.CreateRequest
	localOpen        *workspace.OpenRequest
	registration     *WorkspaceCreation
	remoteRequest    *workspaceCreateParams
}

type workspaceCreateStartedEvent struct {
	WorkspaceID    string `json:"workspaceId"`
	OrganizationID string `json:"organizationId"`
	ProjectID      string `json:"projectId"`
	WorkspaceName  string `json:"workspaceName"`
	SourceBranch   string `json:"sourceBranch"`
	Branch         string `json:"branch"`
	NodeID         string `json:"nodeId,omitempty"`
}

func (h *JSONRPCHandler) prepareWorkspaceCreate(ctx context.Context, req workspaceCreateParams) (preparedWorkspaceCreate, error) {
	normalized := normalizeWorkspaceCreateParams(req)
	if normalized.ID == "" {
		normalized.ID = generateWorkspaceID()
	}
	if normalized.WorkspaceName == "" {
		normalized.WorkspaceName = fallbackWorkspaceName(normalized)
	}
	if isDirectWorkspaceCreateRequest(normalized) {
		return prepareDirectWorkspaceCreate(normalized), nil
	}
	if normalized.Kind == workspace.KindPrimary {
		return h.preparePrimaryWorkspaceCreate(ctx, normalized)
	}
	return h.prepareWorktreeWorkspaceCreate(ctx, normalized)
}

func normalizeWorkspaceCreateParams(req workspaceCreateParams) workspaceCreateParams {
	req.ID = strings.TrimSpace(req.ID)
	req.OrganizationID = strings.TrimSpace(req.OrganizationID)
	req.NodeID = strings.TrimSpace(req.NodeID)
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.RepoKey = strings.TrimSpace(req.RepoKey)
	req.WorkspaceName = strings.TrimSpace(req.WorkspaceName)
	req.SourcePath = strings.TrimSpace(req.SourcePath)
	req.TargetBranch = strings.TrimSpace(req.TargetBranch)
	req.SourceBranch = strings.TrimSpace(req.SourceBranch)
	req.SetupHook = strings.TrimSpace(req.SetupHook)
	req.LocalPath = strings.TrimSpace(req.LocalPath)
	req.Kind = strings.TrimSpace(req.Kind)
	req.Branch = strings.TrimSpace(req.Branch)
	req.ReplyNodeID = strings.TrimSpace(req.ReplyNodeID)
	if req.Kind == "" {
		req.Kind = workspace.KindWorktree
	}
	return req
}

func fallbackWorkspaceName(req workspaceCreateParams) string {
	for _, value := range []string{req.Branch, req.TargetBranch, req.ID} {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}

func isDirectWorkspaceCreateRequest(req workspaceCreateParams) bool {
	return req.SourcePath != "" || req.RepoKey != "" || req.TargetBranch != ""
}

func prepareDirectWorkspaceCreate(req workspaceCreateParams) preparedWorkspaceCreate {
	createReq := workspace.CreateRequest{
		ID:             req.ID,
		OrganizationID: req.OrganizationID,
		NodeID:         req.NodeID,
		ProjectID:      req.ProjectID,
		RepoKey:        req.RepoKey,
		WorkspaceName:  req.WorkspaceName,
		SourcePath:     req.SourcePath,
		TargetBranch:   req.TargetBranch,
		SourceBranch:   req.SourceBranch,
		ContextEnabled: req.ContextEnabled,
		SetupHook:      req.SetupHook,
		TaskRun:        req.TaskRun,
	}
	return preparedWorkspaceCreate{
		workspaceID:    req.ID,
		organizationID: req.OrganizationID,
		projectID:      req.ProjectID,
		startedEvent:   buildWorkspaceCreateStartedEvent(req, req.NodeID, req.TargetBranch),
		localCreate:    &createReq,
	}
}

func (h *JSONRPCHandler) preparePrimaryWorkspaceCreate(ctx context.Context, req workspaceCreateParams) (preparedWorkspaceCreate, error) {
	if req.OrganizationID == "" || req.ProjectID == "" {
		return preparedWorkspaceCreate{}, fmt.Errorf("organizationId and projectId are required")
	}
	if req.LocalPath == "" {
		return preparedWorkspaceCreate{}, fmt.Errorf("localPath is required for primary workspace creation")
	}
	nodeID, err := resolveWorkspaceCreateNode(ctx, h.runtime, h.nodeID, req.OrganizationID, req.NodeID)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	if nodeID != h.nodeID {
		return prepareRemoteWorkspaceCreate(req, nodeID, h.nodeID), nil
	}
	openReq := workspace.OpenRequest{ID: req.ID, Path: req.LocalPath, OrgID: req.OrganizationID, ProjectID: req.ProjectID}
	registration := WorkspaceCreation{ID: req.ID, NodeID: nodeID, OrganizationID: req.OrganizationID, ProjectID: req.ProjectID, Kind: workspace.KindPrimary, LocalPath: req.LocalPath}
	return preparedWorkspaceCreate{workspaceID: req.ID, organizationID: req.OrganizationID, projectID: req.ProjectID, startedEvent: buildWorkspaceCreateStartedEvent(req, nodeID, ""), localOpen: &openReq, registration: &registration}, nil
}

func (h *JSONRPCHandler) prepareWorktreeWorkspaceCreate(ctx context.Context, req workspaceCreateParams) (preparedWorkspaceCreate, error) {
	if req.OrganizationID == "" || req.ProjectID == "" {
		return preparedWorkspaceCreate{}, fmt.Errorf("organizationId and projectId are required")
	}
	if req.Branch == "" || req.SourceBranch == "" {
		return preparedWorkspaceCreate{}, fmt.Errorf("branch and sourceBranch are required")
	}
	nodeID, err := resolveWorkspaceCreateNode(ctx, h.runtime, h.nodeID, req.OrganizationID, req.NodeID)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	if nodeID != h.nodeID {
		return prepareRemoteWorkspaceCreate(req, nodeID, h.nodeID), nil
	}
	project, err := loadProjectForWorkspaceCreate(h.runtime, req.OrganizationID, req.ProjectID)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	sourcePath, err := resolveLocalWorkspaceCreateSourcePath(ctx, h.runtime, req.OrganizationID, req.ProjectID, nodeID, project)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	createReq := workspace.CreateRequest{ID: req.ID, OrganizationID: req.OrganizationID, NodeID: nodeID, ProjectID: req.ProjectID, RepoKey: project.RepoKey, WorkspaceName: req.WorkspaceName, SourcePath: sourcePath, TargetBranch: req.Branch, SourceBranch: req.SourceBranch, ContextEnabled: project.ContextEnabled, SetupHook: project.SetupScript, TaskRun: req.TaskRun}
	registration := WorkspaceCreation{ID: req.ID, NodeID: nodeID, OrganizationID: req.OrganizationID, ProjectID: req.ProjectID, Kind: workspace.KindWorktree, Branch: req.Branch, SourceBranch: req.SourceBranch}
	return preparedWorkspaceCreate{workspaceID: req.ID, organizationID: req.OrganizationID, projectID: req.ProjectID, startedEvent: buildWorkspaceCreateStartedEvent(req, nodeID, req.Branch), relayReplyNodeID: req.ReplyNodeID, localCreate: &createReq, registration: &registration}, nil
}

func prepareRemoteWorkspaceCreate(req workspaceCreateParams, targetNodeID string, replyNodeID string) preparedWorkspaceCreate {
	req.NodeID = targetNodeID
	req.ReplyNodeID = replyNodeID
	branch := req.Branch
	if branch == "" {
		branch = req.TargetBranch
	}
	return preparedWorkspaceCreate{workspaceID: req.ID, organizationID: req.OrganizationID, projectID: req.ProjectID, startedEvent: buildWorkspaceCreateStartedEvent(req, targetNodeID, branch), remoteRequest: &req}
}

func buildWorkspaceCreateStartedEvent(req workspaceCreateParams, nodeID string, branch string) workspaceCreateStartedEvent {
	return workspaceCreateStartedEvent{
		WorkspaceID:    req.ID,
		OrganizationID: req.OrganizationID,
		ProjectID:      req.ProjectID,
		WorkspaceName:  req.WorkspaceName,
		SourceBranch:   req.SourceBranch,
		Branch:         strings.TrimSpace(branch),
		NodeID:         strings.TrimSpace(nodeID),
	}
}

func resolveWorkspaceCreateNode(ctx context.Context, runtime *cliruntime.Runtime, localNodeID string, organizationID string, requestedNodeID string) (string, error) {
	resolvedNodeID := strings.TrimSpace(requestedNodeID)
	if resolvedNodeID == "" {
		resolvedNodeID = strings.TrimSpace(localNodeID)
	}
	if resolvedNodeID == "" {
		return "", fmt.Errorf("workspace node id is required")
	}
	if resolvedNodeID == strings.TrimSpace(localNodeID) {
		return resolvedNodeID, nil
	}
	if runtime == nil || !runtime.APIConfigured() {
		return "", fmt.Errorf("creating a workspace on node %s requires an authenticated API session", resolvedNodeID)
	}
	if err := ensureNodeUsableForWorkspace(runtime, organizationID, resolvedNodeID); err != nil {
		return "", err
	}
	return resolvedNodeID, nil
}

func loadProjectForWorkspaceCreate(runtime *cliruntime.Runtime, organizationID string, projectID string) (api.Project, error) {
	if runtime == nil || !runtime.APIConfigured() {
		return api.Project{}, fmt.Errorf("workspace creation requires an authenticated API session")
	}
	projectsResponse, err := runtime.APIClient().ListProjects(organizationID)
	if err != nil {
		return api.Project{}, fmt.Errorf("load project metadata: %w", err)
	}
	for _, project := range projectsResponse.Projects {
		if project.ID == projectID {
			return project, nil
		}
	}
	return api.Project{}, fmt.Errorf("project %s not found in organization %s", projectID, organizationID)
}

func resolveLocalWorkspaceCreateSourcePath(ctx context.Context, runtime *cliruntime.Runtime, organizationID string, projectID string, nodeID string, project api.Project) (string, error) {
	primaryWorkspace, err := resolvePrimaryWorkspaceForNode(runtime, organizationID, projectID, nodeID)
	if err == nil {
		return strings.TrimSpace(primaryWorkspace.LocalPath), nil
	}
	if strings.TrimSpace(project.RepoURL) == "" {
		return "", fmt.Errorf("no primary workspace found on node %s for project %s and project has no repo URL; create a primary workspace first", nodeID, projectID)
	}
	return ensureSharedRepoClone(ctx, project.RepoKey, project.RepoURL)
}

func resolvePrimaryWorkspaceForNode(runtime *cliruntime.Runtime, organizationID string, projectID string, nodeID string) (api.Workspace, error) {
	workspacesResponse, err := runtime.APIClient().ListWorkspaces(organizationID, projectID)
	if err != nil {
		return api.Workspace{}, fmt.Errorf("load project workspaces: %w", err)
	}
	for _, item := range workspacesResponse.Workspaces {
		if item.Kind == workspace.KindPrimary && item.NodeID == nodeID && strings.TrimSpace(item.LocalPath) != "" {
			return item, nil
		}
	}
	return api.Workspace{}, fmt.Errorf("no primary workspace found on node %s for project %s; create one first", nodeID, projectID)
}
