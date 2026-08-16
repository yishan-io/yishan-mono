package db

import (
	"context"
	"errors"
	"testing"
)

func TestWorkspaceStore_CreateListUpdateAndDelete(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)
	workspace := Workspace{
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		NodeID:         "node-1",
		Kind:           "worktree",
		Status:         "active",
		Branch:         stringPointer("feature/local-db"),
		LocalPath:      "/tmp/yishan-local-db",
		State:          "active",
	}

	if err := workspaceStore.Create(ctx, &workspace); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if workspace.ID == "" {
		t.Fatal("expected create to assign an id")
	}

	workspaces, err := workspaceStore.ListByProject(ctx, "project-1")
	if err != nil {
		t.Fatalf("list project workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].LocalPath != workspace.LocalPath {
		t.Fatalf("expected created workspace, got %#v", workspaces)
	}

	closedStatus := "closed"
	if err := workspaceStore.Update(ctx, workspace.ID, WorkspaceUpdate{Status: &closedStatus}); err != nil {
		t.Fatalf("update workspace: %v", err)
	}
	updatedWorkspace, err := workspaceStore.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if updatedWorkspace.Status != closedStatus {
		t.Fatalf("expected closed workspace, got %#v", updatedWorkspace)
	}

	if err := workspaceStore.Delete(ctx, workspace.ID); err != nil {
		t.Fatalf("delete workspace: %v", err)
	}
	_, err = workspaceStore.Get(ctx, workspace.ID)
	if !errors.Is(err, ErrWorkspaceNotFound) {
		t.Fatalf("expected not found after delete, got %v", err)
	}
}

func TestWorkspaceStore_Create_RejectsDuplicateActiveWorkspace(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)
	branch := stringPointer("feature/local-db")
	firstWorkspace := Workspace{
		OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: branch, LocalPath: "/tmp/one", State: "active",
	}
	secondWorkspace := firstWorkspace
	secondWorkspace.LocalPath = "/tmp/two"

	if err := workspaceStore.Create(ctx, &firstWorkspace); err != nil {
		t.Fatalf("create first workspace: %v", err)
	}
	if err := workspaceStore.Create(ctx, &secondWorkspace); err == nil {
		t.Fatal("expected duplicate active workspace to be rejected")
	}
}

func TestWorkspaceStore_UpsertAndResolvePullRequest(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)
	workspace := Workspace{
		OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: "/tmp/yishan-pr", State: "active",
	}
	if err := workspaceStore.Create(ctx, &workspace); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	pullRequest := WorkspacePullRequest{
		WorkspaceID: workspace.ID, OrganizationID: "org-1", PRID: "42",
		Title: stringPointer("Add local DB"), State: "open", DetectedAt: "2026-07-28T00:00:00Z",
	}

	if err := workspaceStore.UpsertPR(ctx, &pullRequest); err != nil {
		t.Fatalf("upsert pull request: %v", err)
	}
	if pullRequest.ID == "" {
		t.Fatal("expected PR upsert to assign an id")
	}
	if err := workspaceStore.ResolvePR(ctx, workspace.ID, pullRequest.PRID); err != nil {
		t.Fatalf("resolve pull request: %v", err)
	}
	pullRequests, err := workspaceStore.ListPRsByWorkspace(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("list pull requests: %v", err)
	}
	if len(pullRequests) != 1 || pullRequests[0].ResolvedAt == nil {
		t.Fatalf("expected resolved pull request, got %#v", pullRequests)
	}
}

func openTestWorkspaceStore(t *testing.T) *WorkspaceStore {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return NewWorkspaceStore(database)
}

func TestWorkspaceStore_CreateFolder_ListFoldersAndDelete(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)

	folder, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/folder-a", NodeID: "node-1"})
	if err != nil {
		t.Fatalf("create folder workspace: %v", err)
	}
	if folder.ID == "" {
		t.Fatal("expected create folder to assign an id")
	}
	if folder.ProjectID != "" {
		t.Fatalf("expected empty project id, got %q", folder.ProjectID)
	}
	if folder.OrganizationID != "" {
		t.Fatalf("expected empty organization id, got %q", folder.OrganizationID)
	}

	folders, err := workspaceStore.ListFolders(ctx)
	if err != nil {
		t.Fatalf("list folder workspaces: %v", err)
	}
	if len(folders) != 1 {
		t.Fatalf("expected one folder workspace, got %#v", folders)
	}
	if folders[0].ProjectID != "" || folders[0].OrganizationID != "" {
		t.Fatalf("expected scanned folder to have empty project/organization ids, got %#v", folders[0])
	}

	if err := workspaceStore.Delete(ctx, folder.ID); err != nil {
		t.Fatalf("delete folder workspace: %v", err)
	}
	folders, err = workspaceStore.ListFolders(ctx)
	if err != nil {
		t.Fatalf("list folder workspaces after delete: %v", err)
	}
	if len(folders) != 0 {
		t.Fatalf("expected no folder workspaces after delete, got %#v", folders)
	}
}

func TestWorkspaceStore_CreateFolder_MultipleFoldersSameNodeDoNotCollide(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)

	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/folder-a", NodeID: "node-1"}); err != nil {
		t.Fatalf("create first folder workspace: %v", err)
	}
	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/folder-b", NodeID: "node-1"}); err != nil {
		t.Fatalf("create second folder workspace on same node should not collide with unique index: %v", err)
	}

	folders, err := workspaceStore.ListFolders(ctx)
	if err != nil {
		t.Fatalf("list folder workspaces: %v", err)
	}
	if len(folders) != 2 {
		t.Fatalf("expected two folder workspaces, got %#v", folders)
	}
}

func TestWorkspaceStore_CreateFolder_PersistsName(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)

	folder, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{
		LocalPath: "/tmp/folder-named",
		NodeID:    "node-1",
		Name:      "  My Folder  ",
	})
	if err != nil {
		t.Fatalf("create named folder workspace: %v", err)
	}
	if folder.Name == nil || *folder.Name != "My Folder" {
		t.Fatalf("expected trimmed name persisted on create result, got %#v", folder.Name)
	}

	folders, err := workspaceStore.ListFolders(ctx)
	if err != nil {
		t.Fatalf("list folder workspaces: %v", err)
	}
	if len(folders) != 1 || folders[0].Name == nil || *folders[0].Name != "My Folder" {
		t.Fatalf("expected named folder workspace scanned back with name, got %#v", folders)
	}
}

func TestWorkspaceStore_CreateFolder_SamePathRejected(t *testing.T) {
	ctx := context.Background()
	workspaceStore := openTestWorkspaceStore(t)

	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/folder-dup", NodeID: "node-1"}); err != nil {
		t.Fatalf("create first folder workspace: %v", err)
	}
	// A second folder row for the same live local path must be rejected by the
	// partial unique index (idx_workspaces_local_folder_path) regardless of node
	// or name, closing the GetByPath TOCTOU window at the DB layer.
	if _, err := workspaceStore.CreateFolder(ctx, FolderWorkspaceInput{LocalPath: "/tmp/folder-dup", NodeID: "node-2"}); err == nil {
		t.Fatal("expected duplicate folder path to be rejected by unique index")
	}
}
