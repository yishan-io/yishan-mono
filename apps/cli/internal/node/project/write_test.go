package project

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

func createProject(t *testing.T, svc *Service, req rpc.ProjectCreateParams) projectWithWorkspaces {
	t.Helper()
	result, err := svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return result.(projectWithWorkspaces)
}

func TestCreate_StoresProjectAndPrimaryWorkspaceLocally(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	created := createProject(t, svc, rpc.ProjectCreateParams{
		OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", RepoURL: "git@github.com:Acme/Repo.git", LocalPath: "/src/repo",
	})
	if created.SourceType != "git" || created.RepoKey == nil || *created.RepoKey != "acme/repo" || *created.RepoProvider != "github" {
		t.Fatalf("unexpected created project: %#v", created.Project)
	}
	if len(created.Workspaces) != 1 || created.Workspaces[0].Kind != "primary" || created.Workspaces[0].NodeID != "node-1" || created.Workspaces[0].LocalPath != "/src/repo" {
		t.Fatalf("expected this node's primary workspace, got %#v", created.Workspaces)
	}
	if !created.ContextEnabled || created.Icon != "folder" {
		t.Fatalf("expected defaults, got %#v", created.Project)
	}
}

func TestCreate_GitLocalProjectIsKeyedByItsOwnID(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	created := createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Local", TaskPrefix: "LOCA", SourceTypeHint: "git-local", LocalPath: "/src/local"})
	if created.SourceType != "git-local" || created.RepoKey == nil || *created.RepoKey != created.ID {
		t.Fatalf("unexpected git-local project: %#v", created.Project)
	}
}

func TestCreate_RejectsDuplicatePrefixInTheSameOrganization(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "One", TaskPrefix: "REPO"})
	if _, err := svc.Create(context.Background(), rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Two", TaskPrefix: "REPO"}); err == nil {
		t.Fatal("expected a duplicate prefix to be rejected")
	}
	createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-2", Name: "Two", TaskPrefix: "REPO"})
}

func TestCreate_RejectsInvalidInput(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	for _, req := range []rpc.ProjectCreateParams{
		{OrganizationID: "org-1", Name: "", TaskPrefix: "REPO"},
		{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "PERS"},
		{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", RepoURL: "not a url"},
		{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", SourceTypeHint: "git"},
	} {
		if _, err := svc.Create(context.Background(), req); err == nil {
			t.Fatalf("expected %#v to be rejected", req)
		}
	}
}

func TestUpdate_MovesPrimaryWorkspace(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	created := createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", LocalPath: "/old"})
	name, path := "Renamed", "/new"
	result, err := svc.Update(context.Background(), rpc.ProjectUpdateParams{OrganizationID: "org-1", ProjectID: created.ID, Name: &name, LocalPath: &path})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	updated := result.(projectWithWorkspaces)
	if updated.Name != "Renamed" || updated.Workspaces[0].LocalPath != "/new" || updated.Workspaces[0].ID != created.Workspaces[0].ID {
		t.Fatalf("unexpected update: %#v", updated)
	}
	if _, err := svc.Update(context.Background(), rpc.ProjectUpdateParams{OrganizationID: "org-2", ProjectID: created.ID, Name: &name}); err == nil {
		t.Fatal("expected a project from another organization to be rejected")
	}
}

func TestDelete_RemovesProjectFromTheList(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	created := createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", LocalPath: "/src"})
	if _, err := svc.Delete(context.Background(), rpc.ProjectRefParams{OrganizationID: "org-1", ProjectID: created.ID}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if projects := listWithWorkspaces(t, svc); len(projects) != 0 {
		t.Fatalf("deleted project must be gone, got %#v", projects)
	}
	createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Repo", TaskPrefix: "REPO", LocalPath: "/src"})
}

func TestPromoteGit_OnlyPromotesGitLocalProjects(t *testing.T) {
	svc, _ := newLocalTestService(t, nil)
	local := createProject(t, svc, rpc.ProjectCreateParams{OrganizationID: "org-1", Name: "Local", TaskPrefix: "LOCA", SourceTypeHint: "git-local"})
	result, err := svc.PromoteGit(context.Background(), rpc.ProjectPromoteGitParams{OrganizationID: "org-1", ProjectID: local.ID, RemoteURL: "https://github.com/acme/local.git"})
	if err != nil {
		t.Fatalf("promote: %v", err)
	}
	promoted := result.(sqlite.Project)
	if promoted.SourceType != "git" || *promoted.RepoKey != "acme/local" || *promoted.RepoProvider != "github" {
		t.Fatalf("unexpected promotion: %#v", promoted)
	}
	if _, err := svc.PromoteGit(context.Background(), rpc.ProjectPromoteGitParams{OrganizationID: "org-1", ProjectID: local.ID, RemoteURL: "https://github.com/acme/local.git"}); err == nil {
		t.Fatal("a git project must not be promoted again")
	}
}

func TestEnsureTaskPrefix_AssignsAFreeLegacyCandidate(t *testing.T) {
	svc, database := newLocalTestService(t, nil)
	store := sqlite.NewProjectStore(database)
	taken := "MYPRO"
	for _, project := range []sqlite.Project{
		{ID: "other", OrganizationID: "org-1", Name: "Other", SourceType: "unknown", TaskPrefix: &taken},
		{ID: "legacy", OrganizationID: "org-1", Name: "my-project", SourceType: "unknown"},
	} {
		if err := store.Create(context.Background(), project, nil); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	result, err := svc.EnsureTaskPrefix(context.Background(), rpc.ProjectRefParams{OrganizationID: "org-1", ProjectID: "legacy"})
	if err != nil {
		t.Fatalf("ensure: %v", err)
	}
	prefix := result.(sqlite.Project).TaskPrefix
	if prefix == nil || *prefix == taken || validateTaskPrefix(*prefix) != nil {
		t.Fatalf("expected a free valid prefix, got %#v", prefix)
	}
	again, _, _ := svc.TaskPrefix(context.Background(), "legacy")
	if again != *prefix {
		t.Fatalf("prefix must be stable, got %q then %q", *prefix, again)
	}
}
