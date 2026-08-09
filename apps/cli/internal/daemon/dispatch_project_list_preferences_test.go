package daemon

import (
	"context"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

func newProjectListPreferencesTestHandler(t *testing.T) (*JSONRPCHandler, *localdb.ProjectStore) {
	t.Helper()
	root := t.TempDir()
	handler := NewJSONRPCHandler(
		workspace.NewManager(),
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	t.Cleanup(handler.Shutdown)

	database, err := localdb.Open(filepath.Join(root, "db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.SetLocalDatabase(database)
	return handler, localdb.NewProjectStore(database)
}

func TestHandleProjectGetListPreferences_ReturnsDefaultsForMissingOrg(t *testing.T) {
	handler, _ := newProjectListPreferencesTestHandler(t)

	result, err := handler.handleProjectGetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	preference, ok := result.(localdb.ProjectListPreference)
	if !ok {
		t.Fatalf("result type = %T, want localdb.ProjectListPreference", result)
	}
	if preference.Version != localdb.ProjectListPreferencesVersion {
		t.Fatalf("version = %d, want %d", preference.Version, localdb.ProjectListPreferencesVersion)
	}
}

func TestHandleProjectSetGetListPreferences_RoundTrip(t *testing.T) {
	handler, projectStore := newProjectListPreferencesTestHandler(t)

	if err := projectStore.Create(context.Background(), &localdb.Project{
		ID:             "project-1",
		Name:           "one",
		OrganizationID: "org-1",
	}); err != nil {
		t.Fatalf("create project: %v", err)
	}

	preferences := localdb.ProjectListPreference{
		ByProject: localdb.ProjectListModePreference{
			ProjectOrderIds: []string{"project-1"},
		},
	}
	_, err := handler.handleProjectSetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{
			"organizationId": "org-1",
			"preferences":    preferences,
		}),
	)
	if err != nil {
		t.Fatalf("set list preferences: %v", err)
	}

	result, err := handler.handleProjectGetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	got := result.(localdb.ProjectListPreference)
	if len(got.ByProject.ProjectOrderIds) != 1 || got.ByProject.ProjectOrderIds[0] != "project-1" {
		t.Fatalf("project order = %v, want [project-1]", got.ByProject.ProjectOrderIds)
	}
}

func TestHandleProjectGetListPreferences_RequiresOrganizationID(t *testing.T) {
	handler, _ := newProjectListPreferencesTestHandler(t)

	_, err := handler.handleProjectGetListPreferences(context.Background(), marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")

	_, err = handler.handleProjectSetListPreferences(context.Background(), marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")
}

func TestHandleProjectGetListPreferences_PrunesDeletedProject(t *testing.T) {
	handler, projectStore := newProjectListPreferencesTestHandler(t)

	created := &localdb.Project{ID: "project-1", Name: "one", OrganizationID: "org-1"}
	if err := projectStore.Create(context.Background(), created); err != nil {
		t.Fatalf("create project: %v", err)
	}

	if _, err := handler.handleProjectSetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{
			"organizationId": "org-1",
			"preferences": localdb.ProjectListPreference{
				ByProject: localdb.ProjectListModePreference{
					ProjectOrderIds: []string{"project-1", "project-gone"},
				},
			},
		}),
	); err != nil {
		t.Fatalf("set list preferences: %v", err)
	}

	if err := projectStore.Delete(context.Background(), "project-1"); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	result, err := handler.handleProjectGetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	got := result.(localdb.ProjectListPreference)
	if len(got.ByProject.ProjectOrderIds) != 0 {
		t.Fatalf("deleted project id must be pruned, got %v", got.ByProject.ProjectOrderIds)
	}
}
