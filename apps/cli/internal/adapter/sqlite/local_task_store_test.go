package sqlite

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskStore_CreateUpdateAndSearch(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	projectID := "project-1"
	task, err := store.Create(ctx, localtask.Task{ProjectID: &projectID, Title: "Repair SQLite migration", Description: "Durable metadata", Status: localtask.StatusActive, Priority: localtask.PriorityHigh})
	if err != nil {
		t.Fatalf("create local task: %v", err)
	}
	if task.ID == "" || task.ProjectID == nil || *task.ProjectID != projectID {
		t.Fatalf("created task = %#v", task)
	}
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	if _, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusActive}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}
	results, err := store.Search(ctx, "durable metadata", localtask.TaskFilter{WorkspaceID: stringPointer("workspace-1")})
	if err != nil || len(results) != 1 || results[0].ID != task.ID {
		t.Fatalf("search results = %#v, %v", results, err)
	}
	completed := localtask.StatusCompleted
	updated, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &completed})
	if err != nil || updated.CompletedAt == nil {
		t.Fatalf("complete local task = %#v, %v", updated, err)
	}
}

func TestLocalTaskStore_SearchEscapesFTS5Syntax(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	created := createTestLocalTask(t, store, "Quotes OR operators")
	for _, query := range []string{`"quotes`, `quotes OR`, `quotes - operators`, `NEAR(quotes`, `quotes*`, `quotes:`} {
		results, err := store.Search(ctx, query, localtask.TaskFilter{})
		if err != nil {
			t.Fatalf("Search(%q) returned FTS error: %v", query, err)
		}
		for _, result := range results {
			if result.ID != created.ID {
				t.Fatalf("Search(%q) returned unexpected task %#v", query, result)
			}
		}
	}
}

func TestLocalTaskStore_UpdatePreservesCompletedAtAcrossLifecycle(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "Lifecycle timestamp")
	completed := localtask.StatusCompleted
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &completed}); err != nil {
		t.Fatal(err)
	}
	const original = "2026-08-24 12:34:56"
	if _, err := store.database.ExecContext(ctx, `UPDATE local_tasks SET completed_at = ? WHERE id = ?`, original, task.ID); err != nil {
		t.Fatal(err)
	}
	stillCompleted, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &completed})
	if err != nil || stillCompleted.CompletedAt == nil || *stillCompleted.CompletedAt != original {
		t.Fatalf("repeated completion = %#v, %v", stillCompleted, err)
	}
	active := localtask.StatusActive
	reopened, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &active})
	if err != nil || reopened.CompletedAt != nil {
		t.Fatalf("reopened task = %#v, %v", reopened, err)
	}
}

func TestLocalTaskStore_UpdatesUniformLinkLifecycle(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "History task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	link, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusActive})
	if err != nil {
		t.Fatal(err)
	}
	paused, err := store.UpdateWorkspaceLinkStatus(ctx, link.ID, localtask.StatusPaused)
	if err != nil || paused.Status != localtask.StatusPaused {
		t.Fatalf("pause link = %#v, %v", paused, err)
	}
	completed, err := store.UpdateWorkspaceLinkStatus(ctx, link.ID, localtask.StatusCompleted)
	if err != nil || completed.Status != localtask.StatusCompleted {
		t.Fatalf("complete link = %#v, %v", completed, err)
	}
	if err := store.UnlinkWorkspace(ctx, link.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpdateWorkspaceLinkStatus(ctx, link.ID, localtask.StatusActive); !errors.Is(err, localtask.ErrInvalidLink) {
		t.Fatalf("update unlinked history error = %v", err)
	}
}

func TestLocalTaskStore_RejectsDuplicateActivePairAndPreservesHistory(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "Pair task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	link, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusActive})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusPaused}); err == nil {
		t.Fatal("expected duplicate active pair error")
	}
	if err := store.UnlinkWorkspace(ctx, link.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: localtask.StatusActive}); err != nil {
		t.Fatalf("relink after unlink: %v", err)
	}
	links, err := store.ListTaskLinks(ctx, task.ID)
	if err != nil || len(links) != 2 || !hasUnlinkedWorkspaceLink(links) {
		t.Fatalf("link history = %#v, %v", links, err)
	}
}

func TestLocalTaskStore_ValidatesTasksAndLinks(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	_, err := store.Create(ctx, localtask.Task{Title: "", Status: localtask.StatusActive, Priority: localtask.PriorityMedium})
	if !errors.Is(err, localtask.ErrInvalidTask) {
		t.Fatalf("invalid task error = %v", err)
	}
	task := createTestLocalTask(t, store, "Valid task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	_, err = store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: "invalid"})
	if !errors.Is(err, localtask.ErrInvalidLink) {
		t.Fatalf("invalid link error = %v", err)
	}
}

func TestLocalTaskLegacyImportMarker(t *testing.T) {
	store, _ := openTestLocalTaskStore(t)
	isComplete, err := LocalTaskLegacyImportCompleted(context.Background(), store.database, "project-1")
	if err != nil || isComplete {
		t.Fatalf("initial import marker = %t, %v", isComplete, err)
	}
	if err := MarkLocalTaskLegacyImportCompleted(context.Background(), store.database, "project-1"); err != nil {
		t.Fatalf("mark legacy import: %v", err)
	}
	isComplete, err = LocalTaskLegacyImportCompleted(context.Background(), store.database, "project-1")
	if err != nil || !isComplete {
		t.Fatalf("completed import marker = %t, %v", isComplete, err)
	}
}

func openTestLocalTaskStore(t *testing.T) (*LocalTaskStore, *WorkspaceStore) {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return NewLocalTaskStore(database), NewWorkspaceStore(database)
}

func createTestLocalTask(t *testing.T, store *LocalTaskStore, title string) localtask.Task {
	t.Helper()
	task, err := store.Create(context.Background(), localtask.Task{Title: title, Status: localtask.StatusActive, Priority: localtask.PriorityMedium})
	if err != nil {
		t.Fatalf("create test local task: %v", err)
	}
	return task
}

func createLocalTaskWorkspace(t *testing.T, workspaceStore *WorkspaceStore, workspaceID string) {
	t.Helper()
	err := workspaceStore.Create(context.Background(), &Workspace{ID: workspaceID, Kind: "folder", Status: "active", LocalPath: "/tmp/" + workspaceID, State: "active"})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
}

func hasUnlinkedWorkspaceLink(links []localtask.WorkspaceLink) bool {
	for _, link := range links {
		if link.UnlinkedAt != nil {
			return true
		}
	}
	return false
}
