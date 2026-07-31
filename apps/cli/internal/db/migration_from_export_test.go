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
	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, migrationAPICompletedKey)
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

	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, migrationAPICompletedKey)
	if err != nil {
		t.Fatalf("read migration marker: %v", err)
	}
	if alreadyMigrated {
		t.Fatal("did not expect project migration marker when workspace export fails")
	}
}

func TestMigrateUsageFromAPI_ImportsExportedUsageRows(t *testing.T) {
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
		usage: map[string][]APIHourlyUsageRow{
			"org-1": {{
				ProjectID:             "project-1",
				WorkspaceID:           "workspace-1",
				WorkspacePath:         "/tmp/core",
				OrganizationID:        "org-1",
				AgentKind:             "opencode",
				Model:                 "gpt-5",
				ModelNormalized:       "gpt-5",
				BucketStartHourUTC:    "2026-07-31T10:00:00.000Z",
				InputTokens:           10,
				OutputTokens:          5,
				CachedInputTokens:     2,
				CachedWriteTokens:     1,
				ReasoningTokens:       3,
				TotalTokens:           21,
				EventCount:            4,
				SessionCount:          2,
				TurnCount:             6,
				ToolCallCount:         7,
				AttributionConfidence: "exact",
				IngestedAt:            "2026-07-31T10:30:00.000Z",
				RunID:                 "run-1",
			}},
		},
	}

	if err := MigrateUsageFromAPI(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateUsageFromAPI: %v", err)
	}

	state, err := NewHourlyUsageStore(database).GetHourlyUsageSyncState(context.Background())
	if err != nil {
		t.Fatalf("get usage sync state: %v", err)
	}
	if state.TotalRows != 1 || state.DirtyRows != 0 {
		t.Fatalf("expected one clean imported row, got %#v", state)
	}
	alreadyMigrated, err := MetadataKeyExists(context.Background(), database, migrationUsageAPICompletedKey)
	if err != nil {
		t.Fatalf("read usage migration marker: %v", err)
	}
	if !alreadyMigrated {
		t.Fatal("expected usage migration marker")
	}
}
