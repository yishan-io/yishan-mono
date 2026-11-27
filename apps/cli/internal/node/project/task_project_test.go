package project

import (
	"context"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
)

func TestResolveTaskProjects_ReadsLocalProjectsWithinTheirOrganization(t *testing.T) {
	svc, database := newLocalTestService(t, nil)
	project := sqlite.Project{ID: "project-1", OrganizationID: "org-1", Name: "Example", Icon: "code", Color: "#123456", SourceType: "unknown"}
	if err := sqlite.NewProjectStore(database).Create(context.Background(), project, nil); err != nil {
		t.Fatalf("create project: %v", err)
	}
	resolved, err := svc.ResolveTaskProjects(context.Background(), map[string][]string{
		"org-1": {"project-1", "deleted-project"},
		"org-2": {"project-1"},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	want := domain.ProjectDisplay{ID: "project-1", Name: "Example", Icon: "code", Color: "#123456"}
	if len(resolved) != 1 || resolved["project-1"] != want {
		t.Fatalf("unexpected resolution: %#v", resolved)
	}
	if _, found, _ := svc.ResolveTaskProject(context.Background(), "org-2", "project-1"); found {
		t.Fatal("a project from another organization must not resolve")
	}
}
