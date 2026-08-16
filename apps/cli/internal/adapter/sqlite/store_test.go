package db

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func openTestDB(t *testing.T) *WorkspaceStore {
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

func TestStore_ListConvertsOptionalAndEmptyFields(t *testing.T) {
	raw := openTestDB(t)
	ctx := context.Background()

	branch := "feature/x"
	health := "path-missing"
	if err := raw.Create(ctx, &Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: "/tmp/ws-1",
		State: "error", Health: &health,
	}); err != nil {
		t.Fatalf("create ws-1: %v", err)
	}
	if err := raw.Create(ctx, &Workspace{
		ID: "ws-2", Kind: "folder", Status: "closed", LocalPath: "/tmp/ws-2", State: "active",
	}); err != nil {
		t.Fatalf("create ws-2: %v", err)
	}

	store := NewStore(raw)
	rows, err := store.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}

	first := rows[0]
	if first.Branch == nil || *first.Branch != "feature/x" {
		t.Fatalf("row.Branch = %v, want feature/x", first.Branch)
	}
	if first.Health == nil || *first.Health != "path-missing" {
		t.Fatalf("row.Health = %v, want path-missing", first.Health)
	}
	if first.State != "error" || first.Kind != "worktree" || first.Status != "active" {
		t.Fatalf("row = %#v", first)
	}

	second := rows[1]
	if second.Branch != nil || second.Health != nil {
		t.Fatalf("empty optional fields must stay nil, got %#v", second)
	}
	if second.Kind != "folder" || second.Status != "closed" {
		t.Fatalf("row2 = %#v", second)
	}
}

func TestStore_UpdateMapsNotFoundSentinel(t *testing.T) {
	store := NewStore(openTestDB(t))
	state := "error"
	err := store.Update(context.Background(), "missing", workspace.StoredWorkspaceUpdate{State: &state})
	if !errors.Is(err, workspace.ErrWorkspaceNotFound) {
		t.Fatalf("err = %v, want workspace.ErrWorkspaceNotFound", err)
	}
}

func TestStore_UpdatePersistsState(t *testing.T) {
	raw := openTestDB(t)
	ctx := context.Background()
	if err := raw.Create(ctx, &Workspace{
		ID: "ws-1", Kind: "worktree", Status: "active", LocalPath: "/tmp/ws-1", State: "active",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}

	state := "error"
	health := "not-worktree"
	store := NewStore(raw)
	if err := store.Update(ctx, "ws-1", workspace.StoredWorkspaceUpdate{State: &state, Health: &health}); err != nil {
		t.Fatalf("update: %v", err)
	}
	row, err := raw.Get(ctx, "ws-1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if row.State != "error" || row.Health == nil || *row.Health != "not-worktree" {
		t.Fatalf("row = %#v, want error/not-worktree", row)
	}
}

func TestProvisioningRow_NilBranchWhenEmpty(t *testing.T) {
	row := ProvisioningRow(application.Registration{
		ID: "ws-1", NodeID: "node-1", OrganizationID: "org-1", ProjectID: "project-1",
		Kind: workspace.KindWorktree, Branch: "", SourceBranch: "main",
	})
	if row.Status != "provisioning" || row.State != string(workspace.StateActive) || row.LocalPath != "" {
		t.Fatalf("row = %#v", row)
	}
	if row.Branch != nil {
		t.Fatalf("empty branch must be nil, got %v", row.Branch)
	}
	if row.SourceBranch == nil || *row.SourceBranch != "main" {
		t.Fatalf("sourceBranch = %v, want main", row.SourceBranch)
	}
	if row.Kind != "worktree" {
		t.Fatalf("kind = %q, want worktree", row.Kind)
	}
}

func TestActiveUpdate_SetsStatusStateAndPath(t *testing.T) {
	update := ActiveUpdate(workspace.Workspace{ID: "ws-1", Path: "/tmp/ws-1", State: "active"})
	if update.Status == nil || *update.Status != "active" {
		t.Fatalf("status = %v, want active", update.Status)
	}
	if update.State == nil || *update.State != "active" {
		t.Fatalf("state = %v, want active", update.State)
	}
	if update.LocalPath == nil || *update.LocalPath != "/tmp/ws-1" {
		t.Fatalf("localPath = %v, want /tmp/ws-1", update.LocalPath)
	}
}

func TestStatusUpdate_And_StateUpdate(t *testing.T) {
	closed := StatusUpdate("closed")
	if closed.Status == nil || *closed.Status != "closed" {
		t.Fatalf("status = %v, want closed", closed.Status)
	}
	if closed.State != nil {
		t.Fatalf("StatusUpdate must not touch state, got %v", closed.State)
	}

	state := StateUpdate("error", "path-missing")
	if state.State == nil || *state.State != "error" || state.Health == nil || *state.Health != "path-missing" {
		t.Fatalf("state update = %#v", state)
	}
}
