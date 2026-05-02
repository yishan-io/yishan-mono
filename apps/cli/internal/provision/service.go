package provision

import (
	"context"
	"fmt"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
)

type DaemonAuthConfig struct {
	Host        string
	Port        int
	JWTSecret   string
	JWTIssuer   string
	JWTAudience string
	JWTRequired bool
}

type CreateWorkspaceRequest struct {
	OrganizationID string
	ProjectID      string
	LocalPath      string
	Kind           string
	Branch         string
	SourceBranch   string
	WorkspaceName  string
}

type Provisioner struct {
	apiClient        *api.Client
	workspaceManager *workspace.Manager
	localNodeID      string
}

func NewLocalProvisioner(apiClient *api.Client, daemonAuth DaemonAuthConfig, workspaceManager *workspace.Manager, localNodeID string) *Provisioner {
	return &Provisioner{apiClient: apiClient, workspaceManager: workspaceManager, localNodeID: localNodeID}
}

func (p *Provisioner) CreateWorkspace(ctx context.Context, req CreateWorkspaceRequest) (api.CreateWorkspaceResponse, error) {
	if p.localNodeID == "" {
		return api.CreateWorkspaceResponse{}, fmt.Errorf("local daemon node id is not configured")
	}

	project, err := p.resolveProject(req.OrganizationID, req.ProjectID)
	if err != nil {
		return api.CreateWorkspaceResponse{}, err
	}

	localPath := req.LocalPath
	workspaceName := req.WorkspaceName
	if workspaceName == "" {
		workspaceName = req.Branch
	}
	if req.Kind == "worktree" {
		if req.Branch == "" {
			return api.CreateWorkspaceResponse{}, fmt.Errorf("branch is required for worktree workspace")
		}
		if req.SourceBranch == "" {
			return api.CreateWorkspaceResponse{}, fmt.Errorf("sourceBranch is required for worktree workspace")
		}
		if workspaceName == "" {
			return api.CreateWorkspaceResponse{}, fmt.Errorf("workspace name is required for worktree workspace")
		}
		if project.RepoKey == "" {
			return api.CreateWorkspaceResponse{}, fmt.Errorf("project %s is missing repo key", req.ProjectID)
		}
		if localPath == "" {
			localPath, err = defaultWorktreePath(project.RepoKey, workspaceName)
			if err != nil {
				return api.CreateWorkspaceResponse{}, err
			}
		}
	}

	created, err := p.apiClient.CreateWorkspace(req.OrganizationID, req.ProjectID, api.CreateWorkspaceInput{
		NodeID:    p.localNodeID,
		LocalPath: localPath,
		Kind:      req.Kind,
		Branch:    req.Branch,
	})
	if err != nil {
		return api.CreateWorkspaceResponse{}, err
	}

	if created.Workspace.ID == "" {
		return api.CreateWorkspaceResponse{}, fmt.Errorf("created workspace response is missing workspace id")
	}

	if created.Workspace.Kind != "worktree" {
		return created, nil
	}

	if p.workspaceManager == nil {
		return api.CreateWorkspaceResponse{}, fmt.Errorf("local workspace manager is not configured")
	}
	if err := p.ensureWorkspaceProvisionedLocally(ctx, req.OrganizationID, req.ProjectID, p.localNodeID, project, created.Workspace, req.SourceBranch); err != nil {
		return api.CreateWorkspaceResponse{}, fmt.Errorf("workspace %s created in api but local provisioning failed: %w", created.Workspace.ID, err)
	}

	return created, nil
}

func (p *Provisioner) ensureWorkspaceProvisionedLocally(
	ctx context.Context,
	orgID string,
	projectID string,
	nodeID string,
	project api.Project,
	workspaceItem api.Workspace,
	sourceBranch string,
) error {
	localSourcePath := project.LocalPath
	if project.RepoURL != "" && localSourcePath == "" {
		repoPath, err := defaultRepoPath(project.RepoKey)
		if err != nil {
			return err
		}
		if err := ensureBareRepoClone(ctx, project.RepoURL, repoPath); err != nil {
			return err
		}
		localSourcePath = repoPath
	}
	if project.RepoURL == "" && localSourcePath == "" {
		baseWorkspace, err := p.resolvePrimaryWorkspace(orgID, projectID, nodeID)
		if err != nil {
			return err
		}
		localSourcePath = baseWorkspace.LocalPath
	}
	if err := updateGitRepo(ctx, localSourcePath); err != nil {
		return err
	}

	if _, err := p.workspaceManager.CreateWorkspace(ctx, workspace.CreateRequest{
		ID:             workspaceItem.ID,
		RepoKey:        project.RepoKey,
		WorkspaceName:  workspaceItem.Branch,
		SourcePath:     localSourcePath,
		TargetBranch:   workspaceItem.Branch,
		SourceBranch:   sourceBranch,
		ContextEnabled: project.ContextEnabled,
	}); err != nil {
		return fmt.Errorf("create workspace locally: %w", err)
	}
	return nil
}

func (p *Provisioner) resolveProject(orgID string, projectID string) (api.Project, error) {
	response, err := p.apiClient.ListProjects(orgID)
	if err != nil {
		return api.Project{}, err
	}

	for _, project := range response.Projects {
		if project.ID == projectID {
			return project, nil
		}
	}

	return api.Project{}, fmt.Errorf("project %s not found in organization %s", projectID, orgID)
}

func (p *Provisioner) resolvePrimaryWorkspace(orgID string, projectID string, nodeID string) (api.Workspace, error) {
	response, err := p.apiClient.ListWorkspaces(orgID, projectID)
	if err != nil {
		return api.Workspace{}, err
	}

	for _, workspace := range response.Workspaces {
		if workspace.Kind == "primary" && workspace.NodeID == nodeID && workspace.LocalPath != "" {
			return workspace, nil
		}
	}

	return api.Workspace{}, fmt.Errorf("no primary workspace found on node %s for project %s; create one first", nodeID, projectID)
}
