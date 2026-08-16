package project

import (
	"context"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
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
}

func TestGetListPreferences_RequiresOrganizationID(t *testing.T) {
	handler := newPreferencesHandler(t)

	_, err := handler.callRPCForTest(context.Background(), rpc.MethodProjectGetListPreferences, marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")

	_, err = handler.callRPCForTest(context.Background(), rpc.MethodProjectSetListPreferences, marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")
}

func TestGetListPreferences_PrunesDeletedWorkspace(t *testing.T) {
	handler := newPreferencesHandler(t)
	database := sqlite.NewWorkspaceStore(handler.deps.Database)

	if err := database.Create(context.Background(), &sqlite.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: "/tmp/ws", State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if _, err := handler.callRPCForTest(
		context.Background(),
		rpc.MethodProjectSetListPreferences,
		marshalParams(t, map[string]any{
			"organizationId": "org-1",
			"preferences": sqlite.ProjectListPreference{
				WorkspaceOrderByParentId: map[string][]string{"project-1:node-1": {"ws-1", "ws-gone"}},
			},
		}),
	); err != nil {
		t.Fatalf("set list preferences: %v", err)
	}

	if err := database.Delete(context.Background(), "ws-1"); err != nil {
		t.Fatalf("delete workspace: %v", err)
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
	if len(got.WorkspaceOrderByParentId["project-1:node-1"]) != 0 {
		t.Fatalf("deleted workspace id must be pruned, got %v", got.WorkspaceOrderByParentId)
	}
}
