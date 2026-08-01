package db

import (
	"context"
	"errors"
	"testing"
)

type exportAPIClientStub struct {
	configured      bool
	projects        map[string][]APIProject
	workspaces      map[string][]APIWorkspace
	usage           map[string][]APIHourlyUsageRow
	projectErrors   map[string]error
	workspaceErrors map[string]error
	usageErrors     map[string]error
}

func (client *exportAPIClientStub) ExportProjects(ctx context.Context, orgID string) ([]APIProject, error) {
	if err := client.projectErrors[orgID]; err != nil {
		return nil, err
	}
	return client.projects[orgID], nil
}

func (client *exportAPIClientStub) ExportWorkspaces(ctx context.Context, orgID string) ([]APIWorkspace, error) {
	if err := client.workspaceErrors[orgID]; err != nil {
		return nil, err
	}
	return client.workspaces[orgID], nil
}

func (client *exportAPIClientStub) ExportHourlyUsage(ctx context.Context, orgID string) ([]APIHourlyUsageRow, error) {
	if err := client.usageErrors[orgID]; err != nil {
		return nil, err
	}
	return client.usage[orgID], nil
}

func (client *exportAPIClientStub) IsConfigured() bool {
	return client.configured
}

func TestMigrateFromAPI_ImportsExportedProjectsAndWorkspaces(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				RepoURL:        stringPointer("https://github.com/acme/core"),
				OrganizationID: "org-1",
				Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
				ContextEnabled: true,
			}},
		},
		workspaces: map[string][]APIWorkspace{
			"org-1": {{
				ID:             "workspace-1",
				OrganizationID: "org-1",
				ProjectID:      "project-1",
				NodeID:         "node-1",
				Kind:           "primary",
				Status:         "active",
				LocalPath:      "/tmp/core",
			}},
		},
	}

	if err := MigrateFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateFromAPI: %v", err)
	}

	projects, err := NewProjectStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list projects: %v", err)
	}
	if len(projects) != 1 || len(projects[0].Commands) != 1 {
		t.Fatalf("expected imported project with commands, got %#v", projects)
	}
	workspaces, err := NewWorkspaceStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].ProjectID != "project-1" {
		t.Fatalf("expected imported workspace, got %#v", workspaces)
	}
	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationProjectsAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected project migration marker")
	}
}

func TestMigrateFromAPI_DoesNotSetMarkerWhenWorkspaceExportFails(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				OrganizationID: "org-1",
			}},
		},
		workspaceErrors: map[string]error{
			"org-1": errors.New("workspace export failed"),
		},
	}

	if err := MigrateFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateFromAPI: %v", err)
	}

	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationProjectsAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read migration marker: %v", err)
	}
	if alreadyMigrated {
		t.Fatal("did not expect project migration marker when workspace export fails")
	}
}

func TestMigrateFromAPI_IgnoresLegacyCompletionMarker(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{ID: "project-1", Name: "Core", OrganizationID: "org-1"}},
		},
		workspaces: map[string][]APIWorkspace{
			"org-1": {{ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", Status: "closed", LocalPath: "/tmp/core"}},
		},
	}

	if err := MigrateFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateFromAPI: %v", err)
	}

	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, MigrationProjectsAPIExportV1CompletedKey)
	if err != nil {
		t.Fatalf("read migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected export-based project migration marker")
	}
	workspaces, err := NewWorkspaceStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].Status != "closed" {
		t.Fatalf("expected legacy marker to be ignored and closed workspace imported, got %#v", workspaces)
	}
}

func TestProjectMigrationStatusComplete_AcceptsLegacyMarker(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy migration marker: %v", err)
	}

	complete, err := ProjectMigrationStatusComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("ProjectMigrationStatusComplete: %v", err)
	}
	if !complete {
		t.Fatal("expected legacy project migration marker to satisfy status")
	}
}

func TestUsageMigrationStatusComplete_AcceptsLegacyMarker(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	complete, err := UsageMigrationStatusComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("UsageMigrationStatusComplete: %v", err)
	}
	if !complete {
		t.Fatal("expected legacy usage migration marker to satisfy status")
	}
}

func TestExportV1MigrationComplete_DoesNotTreatLegacyMarkersAsRerunComplete(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy project migration marker: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, legacyMigrationUsageAPICompletedKey, "true"); err != nil {
		t.Fatalf("set legacy usage migration marker: %v", err)
	}

	projectsComplete, err := ProjectExportV1MigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("ProjectExportV1MigrationComplete: %v", err)
	}
	if projectsComplete {
		t.Fatal("did not expect legacy project marker to satisfy export-v1 rerun status")
	}
	usageComplete, err := UsageExportV1MigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("UsageExportV1MigrationComplete: %v", err)
	}
	if usageComplete {
		t.Fatal("did not expect legacy usage marker to satisfy export-v1 rerun status")
	}
}
