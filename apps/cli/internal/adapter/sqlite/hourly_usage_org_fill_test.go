package sqlite

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func openHourlyUsageOrgFillDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return database
}

func listUsageOrgsByWorkspace(t *testing.T, store *HourlyUsageStore) map[string]string {
	t.Helper()
	rows, err := store.ListDirtyHourlyRows(context.Background())
	if err != nil {
		t.Fatalf("list dirty rows: %v", err)
	}
	orgs := make(map[string]string, len(rows))
	for _, row := range rows {
		orgs[row.WorkspaceID] = row.OrganizationID
	}
	return orgs
}

func TestReplaceAgentHourlyRowsFillsOrganizationFromLocalRecords(t *testing.T) {
	database := openHourlyUsageOrgFillDB(t)
	if _, err := database.Exec(`INSERT INTO workspaces (id, organization_id, project_id, node_id, kind, status, local_path, state)
		VALUES ('ws-known', 'org-ws', 'project-other', 'node-1', 'worktree', 'active', '/tmp/ws-known', 'active')`); err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO projects (id, organization_id, name) VALUES ('project-known', 'org-project', 'Known')`); err != nil {
		t.Fatalf("insert project: %v", err)
	}

	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()
	byWorkspace := newTestHourlyUsageRow(bucketStart, 10)
	byWorkspace.WorkspaceID = "ws-known"
	byProject := newTestHourlyUsageRow(bucketStart, 20)
	byProject.WorkspaceID = "ws-closed"
	byProject.ProjectID = "project-known"
	unknown := newTestHourlyUsageRow(bucketStart, 30)
	unknown.WorkspaceID = "ws-unknown"
	unknown.ProjectID = "project-unknown"
	explicit := newTestHourlyUsageRow(bucketStart, 40)
	explicit.WorkspaceID = "ws-known-explicit"
	explicit.OrganizationID = "org-explicit"

	store := NewHourlyUsageStore(database)
	rows := []HourlyUsageRow{byWorkspace, byProject, unknown, explicit}
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", rows); err != nil {
		t.Fatalf("replace rows: %v", err)
	}

	orgs := listUsageOrgsByWorkspace(t, store)
	want := map[string]string{
		"ws-known":          "org-ws",
		"ws-closed":         "org-project",
		"ws-unknown":        "",
		"ws-known-explicit": "org-explicit",
	}
	for workspaceID, wantOrg := range want {
		if orgs[workspaceID] != wantOrg {
			t.Fatalf("workspace %s: organization = %q, want %q (all: %#v)", workspaceID, orgs[workspaceID], wantOrg, orgs)
		}
	}
}

func TestReplaceAgentHourlyRowsKeepsOrganizationWhenRescanHasNone(t *testing.T) {
	database := openHourlyUsageOrgFillDB(t)
	store := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).UnixMilli()

	attributed := newTestHourlyUsageRow(bucketStart, 10)
	attributed.OrganizationID = "org-1"
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{attributed}); err != nil {
		t.Fatalf("seed row: %v", err)
	}

	// The workspace has closed, so the rescan no longer knows the org.
	rescanned := newTestHourlyUsageRow(bucketStart, 25)
	if err := store.ReplaceAgentHourlyRows(context.Background(), "claude", []HourlyUsageRow{rescanned}); err != nil {
		t.Fatalf("rescan row: %v", err)
	}

	orgs := listUsageOrgsByWorkspace(t, store)
	if orgs["workspace-1"] != "org-1" {
		t.Fatalf("organization = %q, want org-1", orgs["workspace-1"])
	}
}
