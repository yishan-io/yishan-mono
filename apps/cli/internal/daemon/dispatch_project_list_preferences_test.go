package daemon

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
)

func newProjectListPreferencesTestHandler(t *testing.T) *JSONRPCHandler {
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
	handler.SetLocalDatabase(database, root)
	return handler
}

func TestHandleProjectGetListPreferences_ReturnsDefaultsForMissingOrg(t *testing.T) {
	handler := newProjectListPreferencesTestHandler(t)

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
	handler := newProjectListPreferencesTestHandler(t)

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
	handler := newProjectListPreferencesTestHandler(t)

	_, err := handler.handleProjectGetListPreferences(context.Background(), marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")

	_, err = handler.handleProjectSetListPreferences(context.Background(), marshalParams(t, map[string]any{}))
	requireRPCError(t, err, "organizationId is required")
}

func TestHandleProjectGetListPreferences_PrunesDeletedWorkspace(t *testing.T) {
	handler := newProjectListPreferencesTestHandler(t)
	database := localdb.NewWorkspaceStore(handler.localDatabase)

	if err := database.Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: "/tmp/ws", State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if _, err := handler.handleProjectSetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{
			"organizationId": "org-1",
			"preferences": localdb.ProjectListPreference{
				WorkspaceOrderByParentId: map[string][]string{"project-1:node-1": {"ws-1", "ws-gone"}},
			},
		}),
	); err != nil {
		t.Fatalf("set list preferences: %v", err)
	}

	if err := database.Delete(context.Background(), "ws-1"); err != nil {
		t.Fatalf("delete workspace: %v", err)
	}

	result, err := handler.handleProjectGetListPreferences(
		context.Background(),
		marshalParams(t, map[string]any{"organizationId": "org-1"}),
	)
	if err != nil {
		t.Fatalf("get list preferences: %v", err)
	}
	got := result.(localdb.ProjectListPreference)
	if len(got.WorkspaceOrderByParentId["project-1:node-1"]) != 0 {
		t.Fatalf("deleted workspace id must be pruned, got %v", got.WorkspaceOrderByParentId)
	}
}

func marshalParams(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return raw
}

func requireRPCError(t *testing.T, err error, messageContains string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error containing %q, got nil", messageContains)
	}
	if !strings.Contains(err.Error(), messageContains) {
		t.Fatalf("expected error containing %q, got %q", messageContains, err.Error())
	}
}
