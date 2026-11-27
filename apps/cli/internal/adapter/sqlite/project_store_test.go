package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"testing"
)

func openProjectTestStore(t *testing.T) (*sql.DB, *ProjectStore) {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return database, NewProjectStore(database)
}

func testProject(id string, prefix string) Project {
	return Project{
		ID: id, OrganizationID: "org-1", Name: "Project " + id, SourceType: "git",
		RepoProvider: stringPointer("github"), RepoURL: stringPointer("https://github.com/acme/" + id + ".git"),
		RepoKey: stringPointer("acme/" + id), TaskPrefix: stringPointer(prefix), ContextEnabled: true,
		Commands: []ProjectCommand{{Name: "test", Command: "go test ./..."}},
	}
}

func TestProjectStoreCreateStoresProjectAndPrimaryWorkspace(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	project := testProject("p1", "PONE")
	if err := store.Create(ctx, project, &PrimaryWorkspaceInput{ID: "ws-1", NodeID: "node-1", LocalPath: "/repo"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	stored, err := store.Get(ctx, "p1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(stored.Commands) != 1 || stored.Icon != "folder" || stored.CreatedAt == "" {
		t.Fatalf("unexpected stored project: %#v", stored)
	}
	primary, found, err := store.PrimaryWorkspace(ctx, "p1", "node-1")
	if err != nil || !found {
		t.Fatalf("primary workspace: found=%v err=%v", found, err)
	}
	if primary.ID != "ws-1" || primary.LocalPath != "/repo" || primary.OrganizationID != "org-1" || primary.Kind != "primary" {
		t.Fatalf("unexpected primary workspace: %#v", primary)
	}
}

func TestProjectStoreRejectsDuplicatePrefixAndRepo(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	if err := store.Create(ctx, testProject("p1", "PONE"), nil); err != nil {
		t.Fatalf("create: %v", err)
	}
	samePrefix := testProject("p2", "PONE")
	if err := store.Create(ctx, samePrefix, nil); !errors.Is(err, ErrProjectConflict) {
		t.Fatalf("expected prefix conflict, got %v", err)
	}
	sameRepo := testProject("p3", "PTRE")
	sameRepo.RepoKey = stringPointer("acme/p1")
	if err := store.Create(ctx, sameRepo, nil); !errors.Is(err, ErrProjectConflict) {
		t.Fatalf("expected repo conflict, got %v", err)
	}
	otherOrg := testProject("p4", "PONE")
	otherOrg.OrganizationID = "org-2"
	otherOrg.RepoKey = stringPointer("acme/p1")
	if err := store.Create(ctx, otherOrg, nil); err != nil {
		t.Fatalf("other organization must not conflict: %v", err)
	}
}

func TestProjectStoreDeleteRemovesProjectAndPrimaryWorkspace(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	if err := store.Create(ctx, testProject("p1", "PONE"), &PrimaryWorkspaceInput{ID: "ws-1", NodeID: "node-1", LocalPath: "/repo"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := store.Delete(ctx, "p1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := store.Get(ctx, "p1"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected deleted project to be gone, got %v", err)
	}
	if _, found, _ := store.PrimaryWorkspace(ctx, "p1", "node-1"); found {
		t.Fatal("expected primary workspace row to be removed")
	}
	if err := store.Create(ctx, testProject("p2", "PONE"), nil); err != nil {
		t.Fatalf("prefix must be reusable after delete: %v", err)
	}
	if err := store.Delete(ctx, "p1"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected not found on second delete, got %v", err)
	}
}

func TestProjectStoreUpdateRecordsFields(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	if err := store.Create(ctx, testProject("p1", "PONE"), nil); err != nil {
		t.Fatalf("create: %v", err)
	}
	name, disabled := "Renamed", false
	commands := []ProjectCommand{}
	updated, err := store.Update(ctx, "p1", ProjectUpdate{Name: &name, ContextEnabled: &disabled, Commands: &commands})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Renamed" || updated.ContextEnabled || len(updated.Commands) != 0 {
		t.Fatalf("unexpected updated project: %#v", updated)
	}
	if _, err := store.Update(ctx, "missing", ProjectUpdate{Name: &name}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestProjectStoreImportKeepsExistingRows(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	local := testProject("p1", "PONE")
	local.Name = "Local edit"
	if err := store.Create(ctx, local, nil); err != nil {
		t.Fatalf("create: %v", err)
	}
	remote := testProject("p1", "PONE")
	remote.CreatedAt = "2026-08-01T00:00:00.000Z"
	fresh := testProject("p2", "PTWO")
	primaries := map[string]PrimaryWorkspaceInput{"p2": {ID: "ws-2", NodeID: "node-1", LocalPath: "/p2"}}
	for range 2 {
		if err := store.Import(ctx, []Project{remote, fresh}, primaries); err != nil {
			t.Fatalf("import: %v", err)
		}
	}
	kept, _ := store.Get(ctx, "p1")
	if kept.Name != "Local edit" {
		t.Fatalf("import overwrote a local row: %#v", kept)
	}
	projects, err := store.ListByOrganization(ctx, "org-1")
	if err != nil || len(projects) != 2 {
		t.Fatalf("expected two projects, got %#v err=%v", projects, err)
	}
	if _, found, _ := store.PrimaryWorkspace(ctx, "p2", "node-1"); !found {
		t.Fatal("expected imported primary workspace")
	}
}

func TestProjectStoreSetPrimaryWorkspaceMovesExistingRow(t *testing.T) {
	ctx := context.Background()
	_, store := openProjectTestStore(t)
	project := testProject("p1", "PONE")
	if err := store.Create(ctx, project, &PrimaryWorkspaceInput{ID: "ws-1", NodeID: "node-1", LocalPath: "/old"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := store.SetPrimaryWorkspace(ctx, project, PrimaryWorkspaceInput{ID: "ws-new", NodeID: "node-1", LocalPath: "/new"}); err != nil {
		t.Fatalf("set primary: %v", err)
	}
	primary, _, _ := store.PrimaryWorkspace(ctx, "p1", "node-1")
	if primary.ID != "ws-1" || primary.LocalPath != "/new" {
		t.Fatalf("expected the existing row to move, got %#v", primary)
	}
}
