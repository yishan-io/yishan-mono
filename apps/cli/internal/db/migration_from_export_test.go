package db

import (
	"context"
	"database/sql"
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
	projectCalls    int
	workspaceCalls  int
	usageCalls      int
}

func (client *exportAPIClientStub) ExportProjects(ctx context.Context, orgID string) ([]APIProject, error) {
	client.projectCalls += 1
	if err := client.projectErrors[orgID]; err != nil {
		return nil, err
	}
	return client.projects[orgID], nil
}

func (client *exportAPIClientStub) ExportWorkspaces(ctx context.Context, orgID string) ([]APIWorkspace, error) {
	client.workspaceCalls += 1
	if err := client.workspaceErrors[orgID]; err != nil {
		return nil, err
	}
	return client.workspaces[orgID], nil
}

func (client *exportAPIClientStub) ExportHourlyUsage(ctx context.Context, orgID string) ([]APIHourlyUsageRow, error) {
	client.usageCalls += 1
	if err := client.usageErrors[orgID]; err != nil {
		return nil, err
	}
	return client.usage[orgID], nil
}

func (client *exportAPIClientStub) IsConfigured() bool {
	return client.configured
}

// exportedProjectUpdatedAt is a remote RFC3339 timestamp used in fixtures where
// the export must be treated as newer than the seeded local record.
const exportedProjectUpdatedAt = "2026-07-31T10:00:00.000Z"

func assertRemoteToLocalMigrationComplete(t *testing.T, database *sql.DB, expected bool) {
	t.Helper()

	value, hasKey, err := getMetadataKey(context.Background(), database, RemoteToLocalMigrationCompletedKey)
	if err != nil {
		t.Fatalf("read remote-to-local migration marker: %v", err)
	}
	if hasKey != expected {
		t.Fatalf("expected remote-to-local migration marker present=%v, got %v", expected, hasKey)
	}
	if expected && value != RemoteToLocalMigrationVersion {
		t.Fatalf("expected migration marker version %q, got %q", RemoteToLocalMigrationVersion, value)
	}
}

func TestMigrateRemoteToLocal_ImportsExportedProjectsAndWorkspaces(t *testing.T) {
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

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
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
	assertRemoteToLocalMigrationComplete(t, database, true)
}

func TestMigrateRemoteToLocal_DoesNotSetMarkerWhenWorkspaceExportFails(t *testing.T) {
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

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	assertRemoteToLocalMigrationComplete(t, database, false)
}

func TestMigrateRemoteToLocal_RunsWhenOnlyLegacyMarkerPresent(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, "migration_api_completed", "true"); err != nil {
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

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	workspaces, err := NewWorkspaceStore(database).ListByOrg(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].Status != "closed" {
		t.Fatalf("expected legacy marker not to gate the migration and closed workspace imported, got %#v", workspaces)
	}
	assertRemoteToLocalMigrationComplete(t, database, true)
}

// setProjectUpdatedAt rewrites a local project's updated_at so the backfill
// guard can compare it against the remote export timestamp.
func setProjectUpdatedAt(t *testing.T, database *sql.DB, projectID string, value string) {
	t.Helper()

	if _, err := database.Exec(`UPDATE projects SET updated_at = ? WHERE id = ?`, value, projectID); err != nil {
		t.Fatalf("set project updated_at: %v", err)
	}
}

func TestMigrateRemoteToLocal_BackfillsExistingProjectConfigFromExport(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	legacyProject := &Project{
		ID:             "project-1",
		Name:           "Core",
		SourceType:     "git",
		OrganizationID: "org-1",
		SetupScript:    "",
		PostScript:     "",
		Commands:       []ProjectCommand{},
		ContextEnabled: false,
	}
	if err := projectStore.Create(context.Background(), legacyProject); err != nil {
		t.Fatalf("create legacy project: %v", err)
	}
	setProjectUpdatedAt(t, database, "project-1", "2026-01-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				Icon:           "rocket",
				Color:          "#123456",
				SetupScript:    "bun install",
				PostScript:     "echo done",
				Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
				ContextEnabled: true,
				OrganizationID: "org-1",
				UpdatedAt:      exportedProjectUpdatedAt,
			}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if project.SetupScript != "bun install" || project.PostScript != "echo done" {
		t.Fatalf("expected migrated project scripts to be backfilled, got %#v", project)
	}
	if len(project.Commands) != 1 || project.Commands[0].Command != "bun run dev" {
		t.Fatalf("expected migrated project commands to be backfilled, got %#v", project.Commands)
	}
	if project.Icon != "folder" || project.Color != "#1E66F5" {
		t.Fatalf("expected icon/color defaults to be preserved during script-command backfill, got %#v", project)
	}
	if !project.ContextEnabled {
		t.Fatalf("expected migrated project context to be restored from export, got %#v", project)
	}
	assertRemoteToLocalMigrationComplete(t, database, true)
}

func TestMigrateRemoteToLocal_DoesNotDisableLocallyEnabledContext(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	localProject := &Project{
		ID:             "project-1",
		Name:           "Core",
		SourceType:     "git",
		OrganizationID: "org-1",
		SetupScript:    "bun install",
		PostScript:     "echo done",
		Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
		ContextEnabled: true,
	}
	if err := projectStore.Create(context.Background(), localProject); err != nil {
		t.Fatalf("create local project: %v", err)
	}
	setProjectUpdatedAt(t, database, "project-1", "2026-01-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				SetupScript:    "",
				PostScript:     "",
				Commands:       []ProjectCommand{},
				ContextEnabled: false,
				OrganizationID: "org-1",
				UpdatedAt:      exportedProjectUpdatedAt,
			}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if !project.ContextEnabled {
		t.Fatalf("expected locally enabled context to be preserved when export disables it, got %#v", project)
	}
}

func TestMigrateRemoteToLocal_KeepsContextDisabledWhenExportDisables(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	localProject := &Project{ID: "project-1", Name: "Core", SourceType: "git", OrganizationID: "org-1", ContextEnabled: false}
	if err := projectStore.Create(context.Background(), localProject); err != nil {
		t.Fatalf("create local project: %v", err)
	}
	setProjectUpdatedAt(t, database, "project-1", "2026-01-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				ContextEnabled: false,
				OrganizationID: "org-1",
				UpdatedAt:      exportedProjectUpdatedAt,
			}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if project.ContextEnabled {
		t.Fatalf("expected context to stay disabled when export disables it, got %#v", project)
	}
}

func TestMigrateRemoteToLocal_PreservesLocalProjectConfigWhenExportIsEmpty(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	localProject := &Project{
		ID:             "project-1",
		Name:           "Core",
		SourceType:     "git",
		OrganizationID: "org-1",
		SetupScript:    "bun install",
		PostScript:     "echo done",
		Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
		ContextEnabled: true,
	}
	if err := projectStore.Create(context.Background(), localProject); err != nil {
		t.Fatalf("create local project: %v", err)
	}
	setProjectUpdatedAt(t, database, "project-1", "2026-01-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				SetupScript:    "",
				PostScript:     "",
				Commands:       []ProjectCommand{},
				ContextEnabled: true,
				OrganizationID: "org-1",
				UpdatedAt:      exportedProjectUpdatedAt,
			}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if project.SetupScript != localProject.SetupScript || project.PostScript != localProject.PostScript {
		t.Fatalf("expected local project scripts to be preserved, got %#v", project)
	}
	if len(project.Commands) != 1 || project.Commands[0].Command != localProject.Commands[0].Command {
		t.Fatalf("expected local project commands to be preserved, got %#v", project.Commands)
	}
	if project.Icon != "folder" || project.Color != "#1E66F5" {
		t.Fatalf("expected local icon/color defaults to be preserved, got %#v", project)
	}
	assertRemoteToLocalMigrationComplete(t, database, true)
}

func TestMigrateRemoteToLocal_DoesNotSetMarkerWhenAnyOrgExportFails(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	legacyProject := &Project{ID: "project-1", Name: "Core", SourceType: "git", OrganizationID: "org-1", ContextEnabled: true}
	if err := projectStore.Create(context.Background(), legacyProject); err != nil {
		t.Fatalf("create legacy project: %v", err)
	}
	setProjectUpdatedAt(t, database, "project-1", "2026-01-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				SetupScript:    "bun install",
				Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
				ContextEnabled: true,
				OrganizationID: "org-1",
				UpdatedAt:      exportedProjectUpdatedAt,
			}},
		},
		projectErrors: map[string]error{
			"org-2": errors.New("project export failed"),
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1", "org-2"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if project.SetupScript != "bun install" || len(project.Commands) != 1 {
		t.Fatalf("expected successful org to be backfilled before retry, got %#v", project)
	}
	assertRemoteToLocalMigrationComplete(t, database, false)
}

func TestMigrateRemoteToLocal_DoesNotBackfillWhenLocalProjectIsNewer(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	projectStore := NewProjectStore(database)
	localProject := &Project{
		ID:             "project-1",
		Name:           "Core",
		SourceType:     "git",
		OrganizationID: "org-1",
		SetupScript:    "",
		PostScript:     "",
		Commands:       []ProjectCommand{},
		ContextEnabled: false,
	}
	if err := projectStore.Create(context.Background(), localProject); err != nil {
		t.Fatalf("create local project: %v", err)
	}
	// Local record is newer than the export below.
	setProjectUpdatedAt(t, database, "project-1", "2026-08-01 00:00:00")

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{
				ID:             "project-1",
				Name:           "Core",
				SourceType:     "git",
				SetupScript:    "bun install",
				Commands:       []ProjectCommand{{Name: "dev", Command: "bun run dev"}},
				ContextEnabled: true,
				OrganizationID: "org-1",
				UpdatedAt:      "2026-07-31T10:00:00.000Z",
			}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}

	project, err := projectStore.Get(context.Background(), "project-1")
	if err != nil {
		t.Fatalf("get project: %v", err)
	}
	if project.SetupScript != "" || len(project.Commands) != 0 || project.ContextEnabled {
		t.Fatalf("expected newer local project not to be overwritten by the export, got %#v", project)
	}
	assertRemoteToLocalMigrationComplete(t, database, true)
}

func TestMigrateRemoteToLocal_SkipsWhenCurrentVersionExists(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, RemoteToLocalMigrationCompletedKey, RemoteToLocalMigrationVersion); err != nil {
		t.Fatalf("set migration marker: %v", err)
	}

	client := &exportAPIClientStub{configured: true}
	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}
	if client.projectCalls != 0 || client.workspaceCalls != 0 || client.usageCalls != 0 {
		t.Fatalf("expected migration to return early when current version marker exists, got projectCalls=%d workspaceCalls=%d usageCalls=%d", client.projectCalls, client.workspaceCalls, client.usageCalls)
	}
}

func TestMigrateRemoteToLocal_RerunsWhenVersionDiffers(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := setMetadataKey(context.Background(), database, RemoteToLocalMigrationCompletedKey, "v0"); err != nil {
		t.Fatalf("set migration marker: %v", err)
	}

	client := &exportAPIClientStub{
		configured: true,
		projects: map[string][]APIProject{
			"org-1": {{ID: "project-1", Name: "Core", OrganizationID: "org-1"}},
		},
	}

	if err := MigrateRemoteToLocal(context.Background(), database, []string{"org-1"}, client); err != nil {
		t.Fatalf("MigrateRemoteToLocal: %v", err)
	}
	if client.projectCalls != 1 {
		t.Fatalf("expected migration to re-run when version differs, got projectCalls=%d", client.projectCalls)
	}
	assertRemoteToLocalMigrationComplete(t, database, true)
}
