package workspace

import (
	"context"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/workspace"
	application "yishan/apps/cli/internal/workspace/application"
)

func TestPersistPreparedWorkspace_FinalizesSQLiteRecord(t *testing.T) {
	handler := newTestHandler(t)
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.setTestDatabase(database)

	prepared := preparedWorkspaceCreate{Registration: &application.Registration{
		ID: "workspace-1", NodeID: "node-1", OrganizationID: "org-1", ProjectID: "project-1",
		Kind: workspace.KindWorktree, Branch: "feature/local-db", SourceBranch: "main",
	}}
	created := workspace.Workspace{ID: "workspace-1", OrgID: "org-1", ProjectID: "project-1", Path: t.TempDir(), State: workspace.StateActive}

	if err := handler.PersistPlan(context.Background(), prepared); err != nil {
		t.Fatalf("persist prepared workspace: %v", err)
	}
	provisioningWorkspace, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("get provisioning workspace: %v", err)
	}
	if provisioningWorkspace.Status != "provisioning" || provisioningWorkspace.LocalPath != "" {
		t.Fatalf("unexpected provisioning workspace: %#v", provisioningWorkspace)
	}
	if err := handler.Finalize(context.Background(), prepared, created); err != nil {
		t.Fatalf("finalize persisted workspace: %v", err)
	}
	storedWorkspace, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if storedWorkspace.Status != "active" || storedWorkspace.LocalPath != created.Path || storedWorkspace.Branch == nil || *storedWorkspace.Branch != "feature/local-db" {
		t.Fatalf("unexpected persisted workspace: %#v", storedWorkspace)
	}
}

// newTestHandler creates a Service for dispatch handler unit tests.

func TestPublishWorkspaceSnapshotChanged_PublishesLocalInvalidationEvent(t *testing.T) {
	s := newTestHandler(t)
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	s.PublishSnapshotChanged("org-1", "project-1", "workspace-1", "updated")

	select {
	case event := <-events:
		if event.Topic != "workspaceSnapshotChanged" {
			t.Fatalf("event topic = %q, want %q", event.Topic, "workspaceSnapshotChanged")
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			t.Fatalf("event payload type = %T, want map[string]any", event.Payload)
		}
		if payload["organizationId"] != "org-1" || payload["projectId"] != "project-1" || payload["workspaceId"] != "workspace-1" || payload["change"] != "updated" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for workspace snapshot changed event")
	}
}
