package db

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
	projectStore := NewProjectStore(store.database)
	workspaceStore := NewWorkspaceStore(store.database)
	for _, project := range []*Project{
		{ID: "project-1", Name: "one", OrganizationID: "org-1"},
		{ID: "project-2", Name: "two", OrganizationID: "org-1"},
	} {
		if err := projectStore.Create(context.Background(), project); err != nil {
			t.Fatalf("create project %s: %v", project.ID, err)
		}
	}
	for _, workspace := range []*Workspace{
		{ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-a", Kind: "primary", Status: "active", LocalPath: "/tmp/ws-1", State: "active"},
		{ID: "ws-2", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-a", Kind: "worktree", Status: "active", LocalPath: "/tmp/ws-2", State: "active"},
	} {
		if err := workspaceStore.Create(context.Background(), workspace); err != nil {
			t.Fatalf("create workspace %s: %v", workspace.ID, err)
		}
	}

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
	if got.ByNode.NodeOrderByParentId["root:node"][1] != "node-a" {
		t.Fatalf("root node order = %v", got.ByNode.NodeOrderByParentId)
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

func TestProjectListPreferenceStore_PruneRemovesDeletedProjectAndWorkspaceIDs(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)
	projectStore := NewProjectStore(store.database)
	workspaceStore := NewWorkspaceStore(store.database)

	// Live rows: project-1 (org-1) with workspace ws-1 (node-a).
	if err := projectStore.Create(context.Background(), &Project{
		ID:             "project-1",
		Name:           "live",
		OrganizationID: "org-1",
	}); err != nil {
		t.Fatalf("create project: %v", err)
	}
	if err := workspaceStore.Create(context.Background(), &Workspace{
		ID:             "ws-1",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		NodeID:         "node-a",
		Kind:           "primary",
		Status:         "active",
		LocalPath:      "/tmp/live",
		State:          "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	stored := ProjectListPreference{
		ByProject: ProjectListModePreference{
			ProjectOrderIds: []string{"project-1", "project-gone"},
			NodeOrderByParentId: map[string][]string{
				"project:project-1":    {"node-a", "node-remote"},
				"node:node-a":          {"project-1", "project-gone"},
				"node:node-gone":       {"project-gone"},
				"project:project-gone": {"node-a"},
			},
			FoldedProjectIds: []string{"project-1", "project-gone"},
		},
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

	byProject := got.ByProject
	if len(byProject.ProjectOrderIds) != 1 || byProject.ProjectOrderIds[0] != "project-1" {
		t.Fatalf("pruned project order = %v, want [project-1]", byProject.ProjectOrderIds)
	}
	if len(byProject.FoldedProjectIds) != 1 || byProject.FoldedProjectIds[0] != "project-1" {
		t.Fatalf("pruned folded projects = %v, want [project-1]", byProject.FoldedProjectIds)
	}
	nodeAProjects, ok := byProject.NodeOrderByParentId["node:node-a"]
	if !ok || len(nodeAProjects) != 1 || nodeAProjects[0] != "project-1" {
		t.Fatalf("pruned node: list = %v (ok=%v), want [project-1]", nodeAProjects, ok)
	}
	if _, gone := byProject.NodeOrderByParentId["project:project-gone"]; gone {
		t.Fatalf("stale project: key must be dropped, got %v", byProject.NodeOrderByParentId)
	}
	// Remote node ids are kept even though no local row references them.
	if nodes := byProject.NodeOrderByParentId["project:project-1"]; len(nodes) != 2 {
		t.Fatalf("node ids must be kept, got %v", nodes)
	}
	// A node: key whose project list filters to empty is dropped entirely.
	if _, ok := byProject.NodeOrderByParentId["node:node-gone"]; ok {
		t.Fatalf("empty node: key must be dropped, got %v", byProject.NodeOrderByParentId)
	}
	wsOrder, ok := got.WorkspaceOrderByParentId["project-1:node-a"]
	if !ok || len(wsOrder) != 1 || wsOrder[0] != "ws-1" {
		t.Fatalf("pruned workspace order = %v (ok=%v), want [ws-1]", wsOrder, ok)
	}
	if _, ok := got.WorkspaceOrderByParentId["project-1:node-gone"]; ok {
		t.Fatalf("empty workspace order key must be dropped, got %v", got.WorkspaceOrderByParentId)
	}
}

func TestProjectListPreferenceStore_MigratesLegacyPerModeWorkspaceOrder(t *testing.T) {
	store := openTestProjectListPreferenceDB(t)
	projectStore := NewProjectStore(store.database)
	workspaceStore := NewWorkspaceStore(store.database)
	if err := projectStore.Create(context.Background(), &Project{
		ID: "p1", Name: "live", OrganizationID: "org-1",
	}); err != nil {
		t.Fatalf("create project: %v", err)
	}
	for _, workspace := range []*Workspace{
		{ID: "ws-a", OrganizationID: "org-1", ProjectID: "p1", NodeID: "n1", Kind: "primary", Status: "active", LocalPath: "/tmp/ws-a", State: "active"},
		{ID: "ws-b", OrganizationID: "org-1", ProjectID: "p1", NodeID: "n1", Kind: "worktree", Status: "active", LocalPath: "/tmp/ws-b", State: "active"},
	} {
		if err := workspaceStore.Create(context.Background(), workspace); err != nil {
			t.Fatalf("create workspace %s: %v", workspace.ID, err)
		}
	}

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
