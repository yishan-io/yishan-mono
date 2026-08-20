package project

import (
	"context"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

func newPreferencesHandler(t *testing.T) *Service {
	t.Helper()
	root := t.TempDir()
	handler := newTestService(t, nil)

	database, err := sqlite.Open(filepath.Join(root, "db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.setTestDatabase(database)
	return handler
}

func TestGetListPreferences_ReturnsDefaultsForMissingOrg(t *testing.T) {
	handler := newPreferencesHandler(t)

	result, err := handler.callRPCForTest(
		context.Background(),
		rpc.MethodProjectGetListPreferences,
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	preference, ok := result.(sqlite.ProjectListPreference)
	if !ok {
		t.Fatalf("result type = %T, want sqlite.ProjectListPreference", result)
	}
	if preference.Version != sqlite.ProjectListPreferencesVersion {
		t.Fatalf("version = %d, want %d", preference.Version, sqlite.ProjectListPreferencesVersion)
	}
}

func TestGetSetListPreferences_RoundTrip(t *testing.T) {
	handler := newPreferencesHandler(t)

	preferences := sqlite.ProjectListPreference{
		ByProject: sqlite.ProjectListModePreference{
			ProjectOrderIds: []string{"project-1"},
		},
		WorkspaceOrderByParentId: map[string][]string{
			"project-1:node-1": {"ws-without-local-row"},
		},
	}
	_, err := handler.callRPCForTest(
		context.Background(),
		rpc.MethodProjectSetListPreferences,
		marshalParams(t, map[string]any{
			"organizationId": "org-1",
			"preferences":    preferences,
		}),
	)
	if err != nil {
		t.Fatalf("set list preferences: %v", err)
	}

	result, err := handler.callRPCForTest(
		context.Background(),
		rpc.MethodProjectGetListPreferences,
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	got := result.(sqlite.ProjectListPreference)
	if len(got.ByProject.ProjectOrderIds) != 1 || got.ByProject.ProjectOrderIds[0] != "project-1" {
		t.Fatalf("project order = %v, want [project-1]", got.ByProject.ProjectOrderIds)
	}
	if order := got.WorkspaceOrderByParentId["project-1:node-1"]; len(order) != 1 || order[0] != "ws-without-local-row" {
		t.Fatalf("workspace order = %v, want [ws-without-local-row]", order)
	}
}

func TestGetListPreferences_RequiresOrganizationID(t *testing.T) {
	handler := newPreferencesHandler(t)

	_, err := handler.callRPCForTest(context.Background(), rpc.MethodProjectGetListPreferences, marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")

	_, err = handler.callRPCForTest(context.Background(), rpc.MethodProjectSetListPreferences, marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")
}
