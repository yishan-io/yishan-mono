package sqlite

import (
	"context"
	"testing"
)

func openTestProjectListPreferenceDB(t *testing.T) *ProjectListPreferenceStore {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return NewProjectListPreferenceStore(database)
}

func TestProjectListPreferenceStore_GetMissingOrgReturnsDefaults(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)

	preference, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get preferences: %v", err)
	}
	if preference.Version != ProjectListPreferencesVersion {
		t.Fatalf("version = %d, want %d", preference.Version, ProjectListPreferencesVersion)
	}
	if len(preference.ByProject.ProjectOrderIds) != 0 || len(preference.ByNode.NodeOrderByParentId) != 0 {
		t.Fatalf("expected empty defaults, got %#v", preference)
	}
}

func TestProjectListPreferenceStore_RoundTrip(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)

	want := ProjectListPreference{
		Version: ProjectListPreferencesVersion,
		ByProject: ProjectListModePreference{
			ProjectOrderIds:     []string{"project-2", "project-1"},
			NodeOrderByParentId: map[string][]string{"project:project-1": {"node-a", "node-b"}},
			FoldedProjectIds:    []string{"project-2"},
		},
		ByNode: ProjectListModePreference{
			ProjectOrderIds:     []string{"project-1"},
			NodeOrderByParentId: map[string][]string{"root:node": {"node-b", "node-a"}},
			FoldedProjectIds:    []string{},
			FoldedNodeKeys:      []string{"node-a:project-1"},
		},
		WorkspaceOrderByParentId: map[string][]string{"project-1:node-a": {"ws-1", "ws-2"}},
	}
	if err := store.Set(context.Background(), "org-1", want); err != nil {
		t.Fatalf("set preferences: %v", err)
	}

	got, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get preferences: %v", err)
	}
	if len(got.ByProject.ProjectOrderIds) != 2 || got.ByProject.ProjectOrderIds[0] != "project-2" {
		t.Fatalf("by_project project order = %v, want [project-2 project-1]", got.ByProject.ProjectOrderIds)
	}
	if got.ByProject.NodeOrderByParentId["project:project-1"][0] != "node-a" {
		t.Fatalf("node order = %v", got.ByProject.NodeOrderByParentId)
	}
	if len(got.ByNode.FoldedNodeKeys) != 1 || got.ByNode.FoldedNodeKeys[0] != "node-a:project-1" {
		t.Fatalf("folded node keys = %v", got.ByNode.FoldedNodeKeys)
	}
	if len(got.WorkspaceOrderByParentId["project-1:node-a"]) != 2 {
		t.Fatalf("shared workspace order = %v", got.WorkspaceOrderByParentId)
	}
}

func TestProjectListPreferenceStore_IsOrgIsolated(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)

	first := ProjectListPreference{
		ByProject: ProjectListModePreference{ProjectOrderIds: []string{"project-1"}},
	}
	if err := store.Set(context.Background(), "org-1", first); err != nil {
		t.Fatalf("set org-1: %v", err)
	}

	other, err := store.Get(context.Background(), "org-2")
	if err != nil {
		t.Fatalf("get org-2: %v", err)
	}
	if len(other.ByProject.ProjectOrderIds) != 0 {
		t.Fatalf("org-2 must not see org-1 preferences, got %v", other.ByProject.ProjectOrderIds)
	}
}

func TestProjectListPreferenceStore_CorruptBlobReturnsDefaults(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)

	if err := setMetadataKey(context.Background(), store.database, projectListPreferencesKey("org-1"), "{not-json"); err != nil {
		t.Fatalf("seed corrupt blob: %v", err)
	}

	got, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get corrupt blob: %v", err)
	}
	if len(got.ByProject.ProjectOrderIds) != 0 {
		t.Fatalf("corrupt blob must return defaults, got %#v", got)
	}
}

func TestProjectListPreferenceStore_UnknownVersionReturnsDefaults(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)

	if err := setMetadataKey(context.Background(), store.database, projectListPreferencesKey("org-1"),
		`{"version":99,"by_project":{"projectOrderIds":["p1"]}}`); err != nil {
		t.Fatalf("seed future-version blob: %v", err)
	}

	got, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get future-version blob: %v", err)
	}
	if len(got.ByProject.ProjectOrderIds) != 0 {
		t.Fatalf("future-version blob must return defaults, got %#v", got)
	}
}

func TestProjectListPreferenceStore_GetPreservesStaleWorkspaceOrderIDs(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)
	stored := ProjectListPreference{
		WorkspaceOrderByParentId: map[string][]string{
			"project-1:node-a":    {"ws-1", "ws-gone"},
			"project-1:node-gone": {"ws-gone"},
		},
	}
	if err := store.Set(context.Background(), "org-1", stored); err != nil {
		t.Fatalf("set preferences: %v", err)
	}

	got, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get preferences: %v", err)
	}
	if order := got.WorkspaceOrderByParentId["project-1:node-a"]; len(order) != 2 || order[1] != "ws-gone" {
		t.Fatalf("workspace order = %v, want [ws-1 ws-gone]", order)
	}
	if order := got.WorkspaceOrderByParentId["project-1:node-gone"]; len(order) != 1 || order[0] != "ws-gone" {
		t.Fatalf("stale workspace group = %v, want [ws-gone]", order)
	}
}

func TestProjectListPreferenceStore_MigratesLegacyPerModeWorkspaceOrder(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)
	// Shape written by early builds: workspace order lived inside each mode.
	legacy := `{"version":1,` +
		`"by_project":{"projectOrderIds":["p1"],"workspaceOrderByParentId":{"p1:n1":["ws-a"]}},` +
		`"by_node":{"workspaceOrderByParentId":{"p1:n1":["ws-b","ws-a"]}}}`
	if err := setMetadataKey(context.Background(), store.database, projectListPreferencesKey("org-1"), legacy); err != nil {
		t.Fatalf("seed legacy blob: %v", err)
	}

	got, err := store.Get(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("get preferences: %v", err)
	}
	// by_node overlays by_project on the same key: last-edited-mode wins.
	if order := got.WorkspaceOrderByParentId["p1:n1"]; len(order) != 2 || order[0] != "ws-b" {
		t.Fatalf("migrated workspace order = %v, want [ws-b ws-a]", order)
	}
	if len(got.ByProject.ProjectOrderIds) != 1 || got.ByProject.ProjectOrderIds[0] != "p1" {
		t.Fatalf("mode state must survive migration, got %v", got.ByProject.ProjectOrderIds)
	}
}
