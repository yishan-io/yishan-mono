package db

import (
	"context"
	"errors"
	"testing"
)

func TestWorkspaceStore_CreateListUpdateAndDelete(t *testing.T) {
	ctx := context.Background()
	projectStore := openProjectStore(t)
	project := createTestProject(t, projectStore)
	workspaceStore := NewWorkspaceStore(projectStore.database)
	workspace := Workspace{
		OrganizationID: project.OrganizationID,
		ProjectID:      project.ID,
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

	workspaces, err := workspaceStore.ListByProject(ctx, project.ID)
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
	projectStore := openProjectStore(t)
	project := createTestProject(t, projectStore)
	workspaceStore := NewWorkspaceStore(projectStore.database)
	branch := stringPointer("feature/local-db")
	firstWorkspace := Workspace{
		OrganizationID: project.OrganizationID, ProjectID: project.ID, NodeID: "node-1",
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
	projectStore := openProjectStore(t)
	project := createTestProject(t, projectStore)
	workspaceStore := NewWorkspaceStore(projectStore.database)
	workspace := Workspace{
		OrganizationID: project.OrganizationID, ProjectID: project.ID, NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: "/tmp/yishan-pr", State: "active",
	}
	if err := workspaceStore.Create(ctx, &workspace); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	pullRequest := WorkspacePullRequest{
		WorkspaceID: workspace.ID, OrganizationID: project.OrganizationID, PRID: "42",
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

func createTestProject(t *testing.T, projectStore *ProjectStore) Project {
	t.Helper()

	project := Project{Name: "Test Project", OrganizationID: "org-1", ContextEnabled: true}
	if err := projectStore.Create(context.Background(), &project); err != nil {
		t.Fatalf("create test project: %v", err)
	}
	return project
}
