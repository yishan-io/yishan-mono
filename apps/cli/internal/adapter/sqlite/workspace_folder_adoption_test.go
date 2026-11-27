package sqlite

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func TestWorkspaceStore_CreateFolderPersistsOrganizationAndListsByOrganization(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)
	orgFolder, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/org-a", NodeID: "node-1", OrganizationID: " org-a "})
	if err != nil {
		t.Fatalf("create org folder: %v", err)
	}
	if orgFolder.OrganizationID != "org-a" {
		t.Fatalf("expected trimmed organization id, got %q", orgFolder.OrganizationID)
	}
	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/org-b", NodeID: "node-1", OrganizationID: "org-b"}); err != nil {
		t.Fatalf("create other org folder: %v", err)
	}
	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/unowned", NodeID: "node-1"}); err != nil {
		t.Fatalf("create unowned folder: %v", err)
	}

	folders, err := workspaceStore.ListFoldersByOrganization(ctx, "org-a")
	if err != nil {
		t.Fatalf("list org folders: %v", err)
	}
	if len(folders) != 1 || folders[0].ID != orgFolder.ID || folders[0].OrganizationID != "org-a" {
		t.Fatalf("expected only the org-a folder, got %#v", folders)
	}
	all, err := workspaceStore.ListFolders(ctx)
	if err != nil {
		t.Fatalf("list all folders: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("expected unfiltered list to keep every folder, got %#v", all)
	}
}

func TestWorkspaceStore_AdoptUnownedFoldersAssignsFoldersAndTheirUsage(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)
	unowned, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/unowned", NodeID: "node-1"})
	if err != nil {
		t.Fatalf("create unowned folder: %v", err)
	}
	owned, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/owned", NodeID: "node-1", OrganizationID: "org-b"})
	if err != nil {
		t.Fatalf("create owned folder: %v", err)
	}
	usageStore := NewHourlyUsageStore(workspaceStore.database)
	bucket := time.Now().UTC().Truncate(time.Hour).UnixMilli()
	unownedUsage := newTestHourlyUsageRow(bucket, 10)
	unownedUsage.WorkspaceID = unowned.ID
	ownedUsage := newTestHourlyUsageRow(bucket, 10)
	ownedUsage.WorkspaceID = owned.ID
	if err := usageStore.ReplaceAgentHourlyRows(ctx, "claude", []HourlyUsageRow{unownedUsage, ownedUsage}); err != nil {
		t.Fatalf("seed usage: %v", err)
	}

	adopted, err := workspaceStore.AdoptUnownedFolders(ctx, "org-a")
	if err != nil {
		t.Fatalf("adopt unowned folders: %v", err)
	}
	if len(adopted) != 1 || adopted[0] != unowned.ID {
		t.Fatalf("expected only the unowned folder to be adopted, got %#v", adopted)
	}
	assertFolderOrganization(t, workspaceStore, unowned.ID, "org-a")
	assertFolderOrganization(t, workspaceStore, owned.ID, "org-b")
	assertUsageOrganization(t, workspaceStore.database, unowned.ID, "org-a")
	assertUsageOrganization(t, workspaceStore.database, owned.ID, "")

	again, err := workspaceStore.AdoptUnownedFolders(ctx, "org-c")
	if err != nil {
		t.Fatalf("adopt again: %v", err)
	}
	if len(again) != 0 {
		t.Fatalf("expected a second adoption to be a no-op, got %#v", again)
	}
	assertFolderOrganization(t, workspaceStore, unowned.ID, "org-a")
}

func TestWorkspaceStore_AdoptUnownedFoldersRequiresOrganization(t *testing.T) {
	workspaceStore := openTestWorkspaceStore(t)
	if _, err := workspaceStore.AdoptUnownedFolders(context.Background(), "  "); err == nil {
		t.Fatal("expected an empty organization id to be rejected")
	}
}

func assertFolderOrganization(t *testing.T, workspaceStore *WorkspaceStore, folderID string, want string) {
	t.Helper()
	folder, err := workspaceStore.Get(context.Background(), folderID)
	if err != nil {
		t.Fatalf("get folder %s: %v", folderID, err)
	}
	if folder.OrganizationID != want {
		t.Fatalf("folder %s organization = %q, want %q", folderID, folder.OrganizationID, want)
	}
}

func assertUsageOrganization(t *testing.T, database *sql.DB, workspaceID string, want string) {
	t.Helper()
	var got string
	if err := database.QueryRow(`SELECT organization_id FROM token_usage_hourly WHERE workspace_id = ?`, workspaceID).Scan(&got); err != nil {
		t.Fatalf("read usage organization for %s: %v", workspaceID, err)
	}
	if got != want {
		t.Fatalf("usage organization for %s = %q, want %q", workspaceID, got, want)
	}
}
