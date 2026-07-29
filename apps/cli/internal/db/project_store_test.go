package db

import (
	"context"
	"testing"
)

func TestProjectStore_CreateListUpdateAndDelete(t *testing.T) {
	projectStore := openProjectStore(t)
	ctx := context.Background()
	project := Project{
		Name:           "Yishan",
		OrganizationID: "org-1",
		RepoURL:        stringPointer("https://github.com/yishan-io/yishan.git"),
		Commands:       []ProjectCommand{{Name: "Test", Command: "go test ./..."}},
		ContextEnabled: true,
	}

	if err := projectStore.Create(ctx, &project); err != nil {
		t.Fatalf("create project: %v", err)
	}
	if project.ID == "" {
		t.Fatal("expected create to assign an id")
	}

	projects, err := projectStore.ListByOrg(ctx, "org-1")
	if err != nil {
		t.Fatalf("list projects: %v", err)
	}
	if len(projects) != 1 || projects[0].Name != "Yishan" {
		t.Fatalf("expected created project, got %#v", projects)
	}
	if projects[0].RepoProvider != nil {
		t.Fatalf("expected nullable repo provider, got %q", *projects[0].RepoProvider)
	}
	if len(projects[0].Commands) != 1 || projects[0].Commands[0].Command != "go test ./..." {
		t.Fatalf("expected stored commands, got %#v", projects[0].Commands)
	}

	updatedName := "Yishan Mono"
	isContextEnabled := false
	if err := projectStore.Update(ctx, project.ID, ProjectUpdate{
		Name:           &updatedName,
		ContextEnabled: &isContextEnabled,
	}); err != nil {
		t.Fatalf("update project: %v", err)
	}

	updatedProject, err := projectStore.Get(ctx, project.ID)
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if updatedProject.Name != updatedName || updatedProject.ContextEnabled {
		t.Fatalf("expected updated project fields, got %#v", updatedProject)
	}

	if err := projectStore.Delete(ctx, project.ID); err != nil {
		t.Fatalf("delete project: %v", err)
	}
	projects, err = projectStore.ListByOrg(ctx, "org-1")
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(projects) != 0 {
		t.Fatalf("expected no projects after delete, got %#v", projects)
	}
}

func TestProjectStore_Get_ReturnsNotFound(t *testing.T) {
	projectStore := openProjectStore(t)

	_, err := projectStore.Get(context.Background(), "missing")
	if err == nil {
		t.Fatal("expected missing project error")
	}
}

func openProjectStore(t *testing.T) *ProjectStore {
	t.Helper()

	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return NewProjectStore(database)
}

func stringPointer(value string) *string {
	return &value
}
