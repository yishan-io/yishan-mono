package localtask

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_LinkWorkspaceValidatesScope(t *testing.T) {
	for _, source := range []string{"persisted", "registry"} {
		for _, test := range []struct {
			name                           string
			project, organization          *string
			workspaceProject, workspaceOrg string
			shouldReject                   bool
		}{
			{name: "global", workspaceProject: "other", workspaceOrg: "other"},
			{name: "global empty pointers", project: linkScopePointer(""), organization: linkScopePointer("")},
			{name: "matching project", project: linkScopePointer("p"), workspaceProject: "p"},
			{name: "different project", project: linkScopePointer("p"), workspaceProject: "other", shouldReject: true},
			{name: "missing project", project: linkScopePointer("p"), shouldReject: true},
			{name: "matching organization", organization: linkScopePointer("o"), workspaceOrg: "o"},
			{name: "different organization", organization: linkScopePointer("o"), workspaceOrg: "other", shouldReject: true},
			{name: "missing organization", organization: linkScopePointer("o"), shouldReject: true},
			{name: "matching both", project: linkScopePointer("p"), organization: linkScopePointer("o"), workspaceProject: "p", workspaceOrg: "o"},
			{name: "project matches org differs", project: linkScopePointer("p"), organization: linkScopePointer("o"), workspaceProject: "p", workspaceOrg: "other", shouldReject: true},
		} {
			t.Run(source+"/"+test.name, func(t *testing.T) {
				runWorkspaceScopeCase(t, source, test.project, test.organization, test.workspaceProject, test.workspaceOrg, test.shouldReject)
			})
		}
	}
}

func runWorkspaceScopeCase(t *testing.T, source string, project, organization *string, workspaceProject, workspaceOrg string, shouldReject bool) {
	t.Helper()
	service, store, repository := newTestService(t)
	err := store.Create(context.Background(), &sqlite.Workspace{ID: "w", Kind: "folder", LocalPath: "/tmp/w", Status: "active", State: "active", ProjectID: workspaceProject, OrganizationID: workspaceOrg})
	if err != nil {
		t.Fatal(err)
	}
	if source == "registry" {
		service.deps.Registry = contextTestRegistry{workspaces: []workspace.Workspace{{ID: "w", ProjectID: workspaceProject, OrgID: workspaceOrg}}}
		service.deps.WorkspaceStore = nil
	}
	task, err := repository.Create(context.Background(), domain.Task{Title: "Scoped", Priority: domain.PriorityMedium, ProjectID: project, OrganizationID: organization})
	if err != nil {
		t.Fatal(err)
	}
	assertWorkspaceLinkScope(t, service, repository, task, shouldReject)
}

func assertWorkspaceLinkScope(t *testing.T, service *Service, repository domain.Repository, task domain.Task, shouldReject bool) {
	t.Helper()
	_, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{TaskID: task.ID, WorkspaceID: "w"})
	if shouldReject {
		if !errors.Is(err, domain.ErrInvalidLink) {
			t.Fatalf("link error = %v, want invalid link", err)
		}
	} else if err != nil {
		t.Fatal(err)
	}
	links, err := repository.ListTaskLinks(context.Background(), task.ID)
	expectedLinks := 1
	if shouldReject {
		expectedLinks = 0
	}
	if err != nil || len(links) != expectedLinks {
		t.Fatalf("links = %#v, %v", links, err)
	}
	loaded, err := repository.Get(context.Background(), task.ID)
	// HasActiveWorkspace is derived; linking must not mutate task metadata.
	loaded.HasActiveWorkspace = task.HasActiveWorkspace
	if err != nil || !reflect.DeepEqual(loaded, task) {
		t.Fatalf("task changed: %#v, %v", loaded, err)
	}
}

func linkScopePointer(value string) *string { return &value }
