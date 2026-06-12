package provision

import (
	"context"
	"strings"
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

// TestCreateWorkspace_SlashInBranch verifies that a branch name containing "/"
// is sanitized to "-" in the localPath sent to the API. Without this, the path
// stored in the API would have a "/" in the directory segment, which does not
// match the actual git worktree directory (where git replaces "/" with "-"),
// causing the desktop to fail to open the workspace and immediately close it.
func TestCreateWorkspace_SlashInBranch(t *testing.T) {
	const (
		nodeID           = "node-local"
		orgID            = "org-1"
		projectID        = "proj-1"
		primaryLocalPath = "/home/user/repos/myrepo"
		repoKey          = "myorg/myrepo"
	)

	apiStub := &stubAPIClient{
		projects: []api.Project{
			{
				ID:      projectID,
				RepoKey: repoKey,
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

	_, err := provisioner.CreateWorkspace(context.Background(), CreateWorkspaceRequest{
		OrganizationID: orgID,
		ProjectID:      projectID,
		Kind:           workspace.KindWorktree,
		Branch:         "feature/my-feature",
		SourceBranch:   "main",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	if apiStub.createdWorkspace == nil {
		t.Fatal("expected CreateWorkspace to be called on the API client")
	}

	localPath := apiStub.createdWorkspace.LocalPath
	if strings.Contains(localPath, "/feature/") || strings.HasSuffix(localPath, "/feature") {
		t.Errorf("localPath contains unescaped slash from branch name: %q", localPath)
	}
	if !strings.Contains(localPath, "feature-my-feature") {
		t.Errorf("localPath should contain sanitized branch name %q, got %q", "feature-my-feature", localPath)
	}
}

// TestCreateWorkspace_SlashInBranch_MultipleSlashes verifies that multiple "/"
// in a branch name are all replaced (e.g. "a/b/c" → "a-b-c").
func TestCreateWorkspace_SlashInBranch_MultipleSlashes(t *testing.T) {
	const (
		nodeID           = "node-local"
		orgID            = "org-1"
		projectID        = "proj-1"
		primaryLocalPath = "/home/user/repos/myrepo"
		repoKey          = "myorg/myrepo"
	)

	apiStub := &stubAPIClient{
		projects: []api.Project{
			{
				ID:      projectID,
				RepoKey: repoKey,
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

	_, err := provisioner.CreateWorkspace(context.Background(), CreateWorkspaceRequest{
		OrganizationID: orgID,
		ProjectID:      projectID,
		Kind:           workspace.KindWorktree,
		Branch:         "a/b/c",
		SourceBranch:   "main",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	if apiStub.createdWorkspace == nil {
		t.Fatal("expected CreateWorkspace to be called on the API client")
	}

	localPath := apiStub.createdWorkspace.LocalPath
	if !strings.Contains(localPath, "a-b-c") {
		t.Errorf("localPath should contain sanitized branch name %q, got %q", "a-b-c", localPath)
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
