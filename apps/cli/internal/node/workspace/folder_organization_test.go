package workspace

import (
	"context"
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// Regression: an imported folder used to persist with no organization, and the
// desktop's first open of it carries no orgId either, so its runtime instance
// (and therefore its token usage) stayed unattributed until a daemon restart.
func TestWorkspaceImportLocalPath_FolderOpenInheritsPersistedOrganization(t *testing.T) {
	s, store := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceImportLocalPathParams{Path: t.TempDir(), OrganizationID: "org-a"})
	if err != nil {
		t.Fatalf("marshal import params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceImportLocalPath, params)
	if err != nil {
		t.Fatalf("import local folder: %v", err)
	}
	folder := result.(rpc.WorkspaceImportLocalPathResult).Folder
	stored, err := store.Get(context.Background(), folder.ID)
	if err != nil {
		t.Fatalf("get stored folder: %v", err)
	}
	if stored.OrganizationID != "org-a" {
		t.Fatalf("stored folder organization = %q, want org-a", stored.OrganizationID)
	}

	openParams, err := json.Marshal(rpc.WorkspaceOpenProjectParams{Workspaces: []rpc.WorkspaceOpenProjectEntry{{
		WorkspaceID: folder.ID, WorktreePath: folder.LocalPath, ProjectID: "local-folder", Kind: "folder",
	}}})
	if err != nil {
		t.Fatalf("marshal open params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, openParams); err != nil {
		t.Fatalf("open folder: %v", err)
	}
	opened, ok := s.deps.Registry.Get(folder.ID)
	if !ok {
		t.Fatal("expected the folder to be open")
	}
	if opened.OrgID != "org-a" {
		t.Fatalf("open folder organization = %q, want org-a", opened.OrgID)
	}
}

func TestWorkspaceListLocalFolders_FiltersByOrganization(t *testing.T) {
	s, store := newFolderHandler(t)
	ownFolder, err := store.CreateFolder(context.Background(), sqlite.FolderWorkspaceInput{LocalPath: t.TempDir(), NodeID: "node-1", OrganizationID: "org-a"})
	if err != nil {
		t.Fatalf("create org-a folder: %v", err)
	}
	if _, err := store.CreateFolder(context.Background(), sqlite.FolderWorkspaceInput{LocalPath: t.TempDir(), NodeID: "node-1", OrganizationID: "org-b"}); err != nil {
		t.Fatalf("create org-b folder: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceListLocalFoldersParams{OrganizationID: "org-a"})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceListLocalFolders, params)
	if err != nil {
		t.Fatalf("list org-a folders: %v", err)
	}
	rows := result.([]sqlite.Workspace)
	if len(rows) != 1 || rows[0].ID != ownFolder.ID {
		t.Fatalf("expected only the org-a folder, got %#v", rows)
	}
}

func TestWorkspaceAdoptLocalFolders_AssignsUnownedFoldersAndOpenInstances(t *testing.T) {
	s, store := newFolderHandler(t)
	unowned, err := store.CreateFolder(context.Background(), sqlite.FolderWorkspaceInput{LocalPath: t.TempDir(), NodeID: "node-1"})
	if err != nil {
		t.Fatalf("create unowned folder: %v", err)
	}
	s.deps.Registry.Open(workspace.Workspace{ID: unowned.ID, Path: unowned.LocalPath, Kind: workspace.KindFolder})

	params, err := json.Marshal(rpc.WorkspaceAdoptLocalFoldersParams{OrganizationID: "org-a"})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceAdoptLocalFolders, params)
	if err != nil {
		t.Fatalf("adopt local folders: %v", err)
	}
	adopted := result.(rpc.WorkspaceAdoptLocalFoldersResult)
	if len(adopted.AdoptedIDs) != 1 || adopted.AdoptedIDs[0] != unowned.ID {
		t.Fatalf("unexpected adopted ids %#v", adopted.AdoptedIDs)
	}
	stored, err := store.Get(context.Background(), unowned.ID)
	if err != nil {
		t.Fatalf("get stored folder: %v", err)
	}
	if stored.OrganizationID != "org-a" {
		t.Fatalf("stored folder organization = %q, want org-a", stored.OrganizationID)
	}
	opened, _ := s.deps.Registry.Get(unowned.ID)
	if opened.OrgID != "org-a" {
		t.Fatalf("open folder organization = %q, want org-a", opened.OrgID)
	}

	again, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceAdoptLocalFolders, params)
	if err != nil {
		t.Fatalf("adopt again: %v", err)
	}
	if ids := again.(rpc.WorkspaceAdoptLocalFoldersResult).AdoptedIDs; ids == nil || len(ids) != 0 {
		t.Fatalf("expected an empty (non-nil) adopted list on repeat, got %#v", ids)
	}
}

func TestWorkspaceAdoptLocalFolders_RequiresOrganization(t *testing.T) {
	s, _ := newFolderHandler(t)
	params, err := json.Marshal(rpc.WorkspaceAdoptLocalFoldersParams{})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceAdoptLocalFolders, params); err == nil {
		t.Fatal("expected a missing organizationId to be rejected")
	}
}
