package workspace

import (
	"context"
	"os"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/workspace"
)

func TestCheckWorkspaceHealth_MarksMissingPathWorkspaceError(t *testing.T) {
	s := newTestHandler(t)
	workspacePath := t.TempDir()
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "proj-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}

	s.CheckHealth(context.Background())

	ws, err := s.GetWorkspace("ws-1")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if ws.State != workspace.StateError || ws.Health != workspace.HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", ws.State, ws.Health)
	}

	select {
	case event := <-events:
		payload, ok := event.Payload.(map[string]any)
		if !ok || payload["workspaceId"] != "ws-1" || payload["state"] != string(workspace.StateError) {
			t.Fatalf("unexpected state changed event: %#v", event.Payload)
		}
	case <-time.After(time.Second):
		t.Fatal("expected workspace state changed event")
	}
}

func TestCheckWorkspaceHealth_KeepsHealthyWorkspaceActive(t *testing.T) {
	s := newTestHandler(t)
	workspacePath := t.TempDir()
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "proj-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	s.CheckHealth(context.Background())

	ws, err := s.GetWorkspace("ws-1")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if ws.State != workspace.StateActive {
		t.Fatalf("expected healthy workspace to stay active, got %q", ws.State)
	}
}

func TestCheckWorkspaceHealth_PersistsErrorState(t *testing.T) {
	s := newTestHandler(t)
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	s.setTestDatabase(database)

	workspacePath := t.TempDir()
	branch := "feature/health"
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "project-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}

	s.CheckHealth(context.Background())

	persisted, err := workspaceStore.Get(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateError) || persisted.Health == nil || *persisted.Health != string(workspace.HealthPathMissing) {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
}
