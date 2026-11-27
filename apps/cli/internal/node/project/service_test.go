package project

import (
	"context"
	"net/http"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

const remoteProjectsBody = `{"projects":[
 {"id":"p-here","organizationId":"org-1","name":"Here","taskPrefix":"HERE","sourceType":"git","repoProvider":"github","repoUrl":"https://github.com/acme/here.git","repoKey":"acme/here","icon":"code","color":"#111111","contextEnabled":true,"createdByUserId":"someone-else","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z",
  "workspaces":[{"id":"ws-primary","organizationId":"org-1","projectId":"p-here","nodeId":"node-1","kind":"primary","status":"active","localPath":"/src/here"},
                {"id":"ws-elsewhere","organizationId":"org-1","projectId":"p-here","nodeId":"node-2","kind":"worktree","status":"active","branch":"b","localPath":"/x"}]},
 {"id":"p-mine","organizationId":"org-1","name":"Mine","taskPrefix":"MINE","sourceType":"git","repoUrl":"https://github.com/acme/mine.git","repoKey":"acme/mine","createdByUserId":"user-1","workspaces":[]},
 {"id":"p-worktree","organizationId":"org-1","name":"Worktree","taskPrefix":"WTRE","sourceType":"unknown","createdByUserId":"someone-else","workspaces":[]},
 {"id":"p-other","organizationId":"org-1","name":"Other","taskPrefix":"OTHR","sourceType":"unknown","createdByUserId":"someone-else",
  "workspaces":[{"id":"ws-other","organizationId":"org-1","projectId":"p-other","nodeId":"node-2","kind":"primary","status":"active","localPath":"/elsewhere"}]}
]}`

func importingAPI() *fakeAPI {
	return &fakeAPI{respond: func(request fakeRequest) (int, string) {
		switch {
		case request.Path == "/me":
			return http.StatusOK, `{"user":{"id":"user-1"}}`
		case request.Method == http.MethodGet && request.Path == "/orgs/org-1/projects?withWorkspaces=true":
			return http.StatusOK, remoteProjectsBody
		default:
			return http.StatusOK, `{"project":{"id":"ignored","sourceType":"git"}}`
		}
	}}
}

func listWithWorkspaces(t *testing.T, svc *Service) []projectWithWorkspaces {
	t.Helper()
	result, err := svc.ListWithWorkspaces(context.Background(), rpc.ProjectListWithWorkspacesParams{OrganizationID: "org-1"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	return result.([]projectWithWorkspaces)
}

func TestListWithWorkspaces_ImportsThisMachinesProjectsOnce(t *testing.T) {
	api := importingAPI()
	svc, database := newLocalTestService(t, api)
	worktree := &sqlite.Workspace{ID: "ws-local", OrganizationID: "org-1", ProjectID: "p-worktree", NodeID: "node-1", Kind: "worktree", Status: "active", LocalPath: "/wt", State: "active"}
	if err := sqlite.NewWorkspaceStore(database).Create(context.Background(), worktree); err != nil {
		t.Fatalf("seed worktree: %v", err)
	}

	projects := listWithWorkspaces(t, svc)
	byID := map[string]projectWithWorkspaces{}
	for _, project := range projects {
		byID[project.ID] = project
	}
	if len(projects) != 3 || byID["p-other"].ID != "" {
		t.Fatalf("expected p-here, p-mine, p-worktree; got %#v", projects)
	}
	here := byID["p-here"]
	if len(here.Workspaces) != 1 || here.Workspaces[0].ID != "ws-primary" || here.Workspaces[0].LocalPath != "/src/here" {
		t.Fatalf("expected only this node's primary workspace, got %#v", here.Workspaces)
	}
	if here.TaskPrefix == nil || *here.TaskPrefix != "HERE" || here.Icon != "code" {
		t.Fatalf("imported fields lost: %#v", here.Project)
	}
	if len(byID["p-worktree"].Workspaces) != 1 {
		t.Fatalf("expected local worktree under p-worktree, got %#v", byID["p-worktree"].Workspaces)
	}

	listWithWorkspaces(t, svc)
	if imports := api.calls(http.MethodGet, "/orgs/org-1/projects"); len(imports) != 1 {
		t.Fatalf("expected a single import, got %d", len(imports))
	}
}

func TestListWithWorkspaces_RetriesImportAfterFailure(t *testing.T) {
	api := importingAPI()
	api.setRespond(func(fakeRequest) (int, string) { return http.StatusBadGateway, `{"error":"down"}` })
	svc, _ := newLocalTestService(t, api)
	if projects := listWithWorkspaces(t, svc); len(projects) != 0 {
		t.Fatalf("expected no projects while api-service is down, got %#v", projects)
	}
	api.setRespond(importingAPI().respond)
	if projects := listWithWorkspaces(t, svc); len(projects) != 2 {
		t.Fatalf("expected the import to run once api-service recovers, got %#v", projects)
	}
}

func TestListWithWorkspaces_ServesLocalRowsWhenSignedOut(t *testing.T) {
	svc, database := newLocalTestService(t, nil)
	project := sqlite.Project{ID: "p1", OrganizationID: "org-1", Name: "Local", SourceType: "unknown"}
	if err := sqlite.NewProjectStore(database).Create(context.Background(), project, &sqlite.PrimaryWorkspaceInput{ID: "ws-1", NodeID: "node-1", LocalPath: "/p1"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	projects := listWithWorkspaces(t, svc)
	if len(projects) != 1 || len(projects[0].Workspaces) != 1 || projects[0].Workspaces[0].Kind != "primary" {
		t.Fatalf("unexpected local list: %#v", projects)
	}
}
