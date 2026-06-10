package provision

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
)

// stubAPIClient implements apiClient for testing.
type stubAPIClient struct {
	projects   []api.Project
	workspaces []api.Workspace
	// createdWorkspace is set by CreateWorkspace so tests can assert on it.
	createdWorkspace *api.CreateWorkspaceInput
}

func (s *stubAPIClient) ListProjects(_ string) (api.ListProjectsResponse, error) {
	return api.ListProjectsResponse{Projects: s.projects}, nil
}

func (s *stubAPIClient) ListWorkspaces(_ string, _ string) (api.ListWorkspacesResponse, error) {
	return api.ListWorkspacesResponse{Workspaces: s.workspaces}, nil
}

func (s *stubAPIClient) CreateWorkspace(_ string, _ string, input api.CreateWorkspaceInput) (api.CreateWorkspaceResponse, error) {
	s.createdWorkspace = &input
	return api.CreateWorkspaceResponse{
		Workspace: api.Workspace{
			ID:        "ws-new",
			Kind:      workspace.KindWorktree,
			Branch:    input.Branch,
			NodeID:    input.NodeID,
			LocalPath: input.LocalPath,
		},
	}, nil
}

// stubWorkspaceManager implements workspaceManager for testing.
type stubWorkspaceManager struct {
	syncedPath  string
	createdPath string
}

func (s *stubWorkspaceManager) SyncRepoSource(_ context.Context, repoPath string) error {
	s.syncedPath = repoPath
	return nil
}

func (s *stubWorkspaceManager) CreateWorkspace(_ context.Context, req workspace.CreateRequest) (workspace.Workspace, error) {
	s.createdPath = req.SourcePath
	return workspace.Workspace{ID: req.ID, Path: req.SourcePath}, nil
}

// TestEnsureWorkspaceProvisionedLocally_UsesPrimaryWorkspacePath verifies that
// when a primary workspace exists on the current node, worktree creation uses
// that workspace's path as the source — not a bare clone.
func TestEnsureWorkspaceProvisionedLocally_UsesPrimaryWorkspacePath(t *testing.T) {
	const (
		nodeID           = "node-local"
		orgID            = "org-1"
		projectID        = "proj-1"
		primaryLocalPath = "/home/user/repos/myrepo"
	)

	apiStub := &stubAPIClient{
		projects: []api.Project{
			{
				ID:      projectID,
				RepoKey: "myorg/myrepo",
				RepoURL: "https://github.com/myorg/myrepo.git",
			},
		},
		workspaces: []api.Workspace{
			{
				ID:        "ws-primary",
				Kind:      workspace.KindPrimary,
				NodeID:    nodeID,
				LocalPath: primaryLocalPath,
				ProjectID: projectID,
			},
		},
	}
	managerStub := &stubWorkspaceManager{}

	provisioner := &Provisioner{
		apiClient:        apiStub,
		workspaceManager: managerStub,
		localNodeID:      nodeID,
	}

	project := apiStub.projects[0]
	newWorkspace := api.Workspace{
		ID:        "ws-new",
		Kind:      workspace.KindWorktree,
		Branch:    "feature/my-feature",
		NodeID:    nodeID,
		ProjectID: projectID,
	}

	err := provisioner.ensureWorkspaceProvisionedLocally(
		context.Background(),
		orgID,
		projectID,
		nodeID,
		project,
		newWorkspace,
		"main",
		nil,
	)
	if err != nil {
		t.Fatalf("ensureWorkspaceProvisionedLocally: %v", err)
	}

	if managerStub.syncedPath != primaryLocalPath {
		t.Errorf("SyncRepoSource: expected path %q, got %q", primaryLocalPath, managerStub.syncedPath)
	}
	if managerStub.createdPath != primaryLocalPath {
		t.Errorf("CreateWorkspace SourcePath: expected %q (primary workspace path), got %q", primaryLocalPath, managerStub.createdPath)
	}
}

// TestEnsureWorkspaceProvisionedLocally_NoPrimaryNoRepoURL verifies that when
// no primary workspace exists on the node and the project has no RepoURL,
// a clear error is returned asking the user to create a primary workspace.
func TestEnsureWorkspaceProvisionedLocally_NoPrimaryNoRepoURL(t *testing.T) {
	const nodeID = "node-local"

	apiStub := &stubAPIClient{
		workspaces: []api.Workspace{},
	}
	managerStub := &stubWorkspaceManager{}

	provisioner := &Provisioner{
		apiClient:        apiStub,
		workspaceManager: managerStub,
		localNodeID:      nodeID,
	}

	project := api.Project{
		ID:      "proj-1",
		RepoKey: "myorg/myrepo",
		RepoURL: "", // no remote URL
	}
	newWorkspace := api.Workspace{
		ID:     "ws-new",
		Kind:   workspace.KindWorktree,
		Branch: "feature/x",
		NodeID: nodeID,
	}

	err := provisioner.ensureWorkspaceProvisionedLocally(
		context.Background(),
		"org-1",
		"proj-1",
		nodeID,
		project,
		newWorkspace,
		"main",
		nil,
	)
	if err == nil {
		t.Fatal("expected error when no primary workspace and no RepoURL, got nil")
	}
}
