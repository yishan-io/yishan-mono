package provision

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/nodeid"
	"yishan/apps/cli/internal/workspace"
)

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

func NewLocalProvisioner(apiClient *api.Client, workspaceManager *workspace.Manager, localNodeID string) *Provisioner {
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
	if req.Kind == workspace.KindWorktree {
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
			localPath, err = workspace.DefaultWorktreePath(project.RepoKey, workspaceName)
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

	if created.Workspace.Kind != workspace.KindWorktree {
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
		repoPath, err := workspace.DefaultRepoPath(project.RepoKey)
		if err != nil {
			return err
		}
		if err := workspace.EnsureBareRepoClone(ctx, project.RepoURL, repoPath); err != nil {
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
	if err := p.workspaceManager.SyncRepoSource(ctx, localSourcePath); err != nil {
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
		SetupHook:      project.SetupScript,
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

	for _, ws := range response.Workspaces {
		if ws.Kind == workspace.KindPrimary && ws.NodeID == nodeID && ws.LocalPath != "" {
			return ws, nil
		}
	}

	return api.Workspace{}, fmt.Errorf("no primary workspace found on node %s for project %s; create one first", nodeID, projectID)
}

// RuntimeConfig holds the configuration needed to create a runtime provisioner
// from the running daemon's state.
type RuntimeConfig struct {
	ConfigPath string
}

// NewRuntimeProvisioner creates a Provisioner wired to the local daemon's node
// ID, resolved from the daemon state file at runtime.
func NewRuntimeProvisioner(apiClient *api.Client, cfg RuntimeConfig) *Provisioner {
	localNodeID := ""

	statePath, err := daemon.ResolveStateFilePath(cfg.ConfigPath)
	if err != nil {
		log.Warn().Err(err).Msg("failed to resolve daemon runtime state path")
	} else {
		daemonIDPath := filepath.Join(filepath.Dir(statePath), nodeid.FileName)
		if id, err := nodeid.EnsureDaemonID(daemonIDPath); err == nil {
			localNodeID = id
		} else {
			log.Warn().Err(err).Msg("failed to resolve local daemon id")
		}
	}

	return NewLocalProvisioner(apiClient, workspace.NewManager(), localNodeID)
}
