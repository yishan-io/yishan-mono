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
	task, err := store.Create(ctx, localtask.Task{
		ProjectID: &projectID, Title: "Repair SQLite migration", Description: "Durable metadata",
		Status: localtask.StatusActive, Priority: localtask.PriorityHigh,
	})
	if err != nil {
		t.Fatalf("create local task: %v", err)
	}
	if task.ID == "" || task.ProjectID == nil || *task.ProjectID != projectID {
		t.Fatalf("created task = %#v", task)
	}
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	if _, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "workspace-1", Role: localtask.LinkRoleRelated, Status: localtask.StatusActive,
	}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}
	results, err := store.Search(ctx, "durable metadata", localtask.TaskFilter{WorkspaceID: stringPointer("workspace-1")})
	if err != nil || len(results) != 1 || results[0].ID != task.ID {
		t.Fatalf("search results = %#v, %v", results, err)
	}
	completed := localtask.StatusCompleted
	updated, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &completed})
	if err != nil {
		t.Fatalf("complete local task: %v", err)
	}
	if updated.CompletedAt == nil {
		t.Fatalf("completed task = %#v, want completion time", updated)
	}
}

func TestLocalTaskStore_SetPrimaryWorkspaceTaskReplacesPrimary(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	first := createTestLocalTask(t, store, "First task")
	second := createTestLocalTask(t, store, "Second task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	if _, err := store.SetPrimaryWorkspaceTask(ctx, first.ID, "workspace-1"); err != nil {
		t.Fatalf("set first primary task: %v", err)
	}
	primary, err := store.SetPrimaryWorkspaceTask(ctx, second.ID, "workspace-1")
	if err != nil {
		t.Fatalf("replace primary task: %v", err)
	}
	if primary.LocalTaskID != second.ID || primary.Role != localtask.LinkRolePrimary {
		t.Fatalf("primary link = %#v", primary)
	}
	links, err := store.ListWorkspaceLinks(ctx, "workspace-1")
	if err != nil || len(links) != 2 {
		t.Fatalf("workspace links = %#v, %v", links, err)
	}
	firstLink := findWorkspaceLink(t, links, first.ID)
	if firstLink.Role != localtask.LinkRoleRelated {
		t.Fatalf("replaced primary link = %#v", firstLink)
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
	_, err = store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: task.ID, WorkspaceID: "workspace-1", Role: "invalid", Status: localtask.StatusActive})
	if !errors.Is(err, localtask.ErrInvalidLink) {
		t.Fatalf("invalid link error = %v", err)
	}
	if err := store.UnlinkWorkspace(ctx, "missing"); !errors.Is(err, localtask.ErrLinkNotFound) {
		t.Fatalf("missing link error = %v", err)
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

func findWorkspaceLink(t *testing.T, links []localtask.WorkspaceLink, taskID string) localtask.WorkspaceLink {
	t.Helper()
	for _, link := range links {
		if link.LocalTaskID == taskID {
			return link
		}
	}
	t.Fatalf("task %q was not linked: %#v", taskID, links)
	return localtask.WorkspaceLink{}
}

func createLocalTaskWorkspace(t *testing.T, workspaceStore *WorkspaceStore, workspaceID string) {
	t.Helper()
	err := workspaceStore.Create(context.Background(), &Workspace{
		ID: workspaceID, Kind: "folder", Status: "active", LocalPath: "/tmp/" + workspaceID, State: "active",
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
}
