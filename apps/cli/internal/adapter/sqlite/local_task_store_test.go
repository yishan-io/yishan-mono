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

func TestLocalTaskStore_SearchEscapesFTS5Syntax(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	created := createTestLocalTask(t, store, "Quotes OR operators")
	queries := []string{`"quotes`, `quotes OR`, `quotes - operators`, `NEAR(quotes`, `quotes*`, `quotes:`}
	for _, query := range queries {
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
	recompleted, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Status: &completed})
	if err != nil || recompleted.CompletedAt == nil || *recompleted.CompletedAt == original {
		t.Fatalf("recompleted task = %#v, %v", recompleted, err)
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
	assertWorkspaceActivePrimary(t, store, "workspace-1", first.ID)
	primary, err := store.SetPrimaryWorkspaceTask(ctx, second.ID, "workspace-1")
	if err != nil {
		t.Fatalf("replace primary task: %v", err)
	}
	if primary.LocalTaskID != second.ID || primary.Role != localtask.LinkRolePrimary {
		t.Fatalf("primary link = %#v", primary)
	}
	assertWorkspaceActivePrimary(t, store, "workspace-1", second.ID)
	links, err := store.ListWorkspaceLinks(ctx, "workspace-1")
	if err != nil || len(links) != 2 {
		t.Fatalf("workspace links = %#v, %v", links, err)
	}
	firstLink := findWorkspaceLink(t, links, first.ID)
	if firstLink.Role != localtask.LinkRoleRelated {
		t.Fatalf("replaced primary link = %#v", firstLink)
	}
}

func TestLocalTaskStore_UpdateWorkspaceLinkStatusManagesPrimaryLifecycle(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	first := createTestLocalTask(t, store, "First task")
	second := createTestLocalTask(t, store, "Second task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	firstLink, err := store.SetPrimaryWorkspaceTask(ctx, first.ID, "workspace-1")
	if err != nil {
		t.Fatalf("set first primary: %v", err)
	}
	paused, err := store.UpdateWorkspaceLinkStatus(ctx, firstLink.ID, localtask.StatusPaused)
	if err != nil || paused.Status != localtask.StatusPaused {
		t.Fatalf("pause primary = %#v, %v", paused, err)
	}
	_, err = store.SetPrimaryWorkspaceTask(ctx, second.ID, "workspace-1")
	if err != nil {
		t.Fatalf("set second primary: %v", err)
	}
	reactivated, err := store.UpdateWorkspaceLinkStatus(ctx, firstLink.ID, localtask.StatusActive)
	if err != nil || reactivated.Status != localtask.StatusActive || reactivated.Role != localtask.LinkRolePrimary {
		t.Fatalf("reactivate primary = %#v, %v", reactivated, err)
	}
	links, err := store.ListWorkspaceLinks(ctx, "workspace-1")
	if err != nil {
		t.Fatal(err)
	}
	if replaced := findWorkspaceLink(t, links, second.ID); replaced.Role != localtask.LinkRoleRelated {
		t.Fatalf("replaced primary = %#v", replaced)
	}
	assertActivePrimaryLink(t, links, first.ID)
}

func TestLocalTaskStore_UpdateWorkspaceLinkStatusCompletesAndReactivatesPrimary(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	first := createTestLocalTask(t, store, "First task")
	second := createTestLocalTask(t, store, "Second task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	firstLink, err := store.SetPrimaryWorkspaceTask(ctx, first.ID, "workspace-1")
	if err != nil {
		t.Fatalf("set first primary: %v", err)
	}
	completed, err := store.UpdateWorkspaceLinkStatus(ctx, firstLink.ID, localtask.StatusCompleted)
	if err != nil || completed.Status != localtask.StatusCompleted || completed.Role != localtask.LinkRolePrimary {
		t.Fatalf("complete primary = %#v, %v", completed, err)
	}
	if _, err := store.SetPrimaryWorkspaceTask(ctx, second.ID, "workspace-1"); err != nil {
		t.Fatalf("set second primary: %v", err)
	}
	reactivated, err := store.UpdateWorkspaceLinkStatus(ctx, firstLink.ID, localtask.StatusActive)
	if err != nil || reactivated.Status != localtask.StatusActive || reactivated.Role != localtask.LinkRolePrimary {
		t.Fatalf("reactivate completed primary = %#v, %v", reactivated, err)
	}
	links, err := store.ListWorkspaceLinks(ctx, "workspace-1")
	if err != nil {
		t.Fatal(err)
	}
	if replaced := findWorkspaceLink(t, links, second.ID); replaced.Role != localtask.LinkRoleRelated {
		t.Fatalf("replaced primary = %#v", replaced)
	}
	assertActivePrimaryLink(t, links, first.ID)
}

func TestLocalTaskStore_UpdateWorkspaceLinkStatusRejectsInvalidMissingAndUnlinkedChanges(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	task := createTestLocalTask(t, store, "History task")
	createLocalTaskWorkspace(t, workspaceStore, "workspace-1")
	link, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "workspace-1", Role: localtask.LinkRoleRelated, Status: localtask.StatusActive,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpdateWorkspaceLinkStatus(ctx, link.ID, localtask.Status("invalid")); !errors.Is(err, localtask.ErrInvalidLink) {
		t.Fatalf("invalid status error = %v", err)
	}
	if _, err := store.UpdateWorkspaceLinkStatus(ctx, "missing", localtask.StatusPaused); !errors.Is(err, localtask.ErrLinkNotFound) {
		t.Fatalf("missing link error = %v", err)
	}
	if err := store.UnlinkWorkspace(ctx, link.ID); err != nil {
		t.Fatal(err)
	}
	for _, status := range []localtask.Status{localtask.StatusActive, localtask.StatusPaused, localtask.StatusCompleted} {
		if _, err := store.UpdateWorkspaceLinkStatus(ctx, link.ID, status); !errors.Is(err, localtask.ErrInvalidLink) {
			t.Fatalf("update unlinked history to %q error = %v", status, err)
		}
	}
	reloaded, err := store.ListTaskLinks(ctx, task.ID)
	if err != nil || len(reloaded) != 1 {
		t.Fatalf("reload history = %#v, %v", reloaded, err)
	}
	if reloaded[0].Status != localtask.StatusCompleted || reloaded[0].UnlinkedAt == nil {
		t.Fatalf("unlinked history = %#v", reloaded[0])
	}
}

func assertWorkspaceActivePrimary(t *testing.T, store *LocalTaskStore, workspaceID string, taskID string) {
	t.Helper()
	links, err := store.ListWorkspaceLinks(context.Background(), workspaceID)
	if err != nil {
		t.Fatalf("list workspace links: %v", err)
	}
	assertActivePrimaryLink(t, links, taskID)
}

func assertActivePrimaryLink(t *testing.T, links []localtask.WorkspaceLink, taskID string) {
	t.Helper()
	count := 0
	for _, link := range links {
		if link.Role == localtask.LinkRolePrimary && link.Status == localtask.StatusActive && link.UnlinkedAt == nil {
			count++
			if link.LocalTaskID != taskID {
				t.Fatalf("active primary = %#v, want task %q", link, taskID)
			}
		}
	}
	if count != 1 {
		t.Fatalf("active primary count = %d, want 1", count)
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
