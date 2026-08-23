package sqlite

import (
	"context"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskStore_PersistsHydratesAndReplacesTagsAtomically(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	task, err := store.Create(ctx, localtask.Task{Title: "Tagged task", Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, Tags: []string{" Alpha ", "BETA", "alpha"}})
	if err != nil {
		t.Fatalf("create tagged task: %v", err)
	}
	assertTaskTags(t, task, []string{"Alpha", "BETA"})

	unchanged, err := store.Update(ctx, task.ID, localtask.TaskUpdate{})
	if err != nil {
		t.Fatalf("update without tags: %v", err)
	}
	assertTaskTags(t, unchanged, []string{"Alpha", "BETA"})

	replacement := []string{"Gamma", "Delta"}
	updated, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Tags: &replacement})
	if err != nil {
		t.Fatalf("replace tags: %v", err)
	}
	assertTaskTags(t, updated, replacement)

	clear := []string{}
	cleared, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Tags: &clear})
	if err != nil {
		t.Fatalf("clear tags: %v", err)
	}
	assertTaskTags(t, cleared, []string{})
}

func TestLocalTaskStore_RollsBackTagWritesWhenTriggerAborts(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	if _, err := store.database.Exec(`CREATE TRIGGER abort_bad_tag BEFORE INSERT ON local_task_tags
		WHEN NEW.tag = 'abort' BEGIN SELECT RAISE(ABORT, 'tag rejected'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create(ctx, localtask.Task{Title: "Rejected", Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, Tags: []string{"abort"}}); err == nil {
		t.Fatal("expected create to abort")
	}
	var taskCount int
	if err := store.database.QueryRow(`SELECT COUNT(*) FROM local_tasks WHERE title = 'Rejected'`).Scan(&taskCount); err != nil || taskCount != 0 {
		t.Fatalf("aborted task count = %d, %v; want 0", taskCount, err)
	}

	task := createTestLocalTask(t, store, "Existing")
	original := []string{"kept"}
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Tags: &original}); err != nil {
		t.Fatalf("set original tag: %v", err)
	}
	bad := []string{"abort"}
	changedTitle := "Changed"
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{Title: &changedTitle, Tags: &bad}); err == nil {
		t.Fatal("expected update to abort")
	}
	persisted, err := store.Get(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertTaskTags(t, persisted, original)
	if persisted.Title != "Existing" {
		t.Fatalf("aborted update title = %q", persisted.Title)
	}
}

func TestLocalTaskStore_FiltersAndSearchesWithAllFoldedTags(t *testing.T) {
	ctx := context.Background()
	store, workspaceStore := openTestLocalTaskStore(t)
	first := createTaggedTask(t, store, "searchable first", []string{"Alpha", "Beta"})
	_ = createTaggedTask(t, store, "searchable second", []string{"alpha"})
	createTaggedTask(t, store, "searchable third", []string{"BETA", "Gamma"})
	createLocalTaskWorkspace(t, workspaceStore, "workspace-tags")
	if _, err := store.LinkWorkspace(ctx, localtask.WorkspaceLink{LocalTaskID: first.ID, WorkspaceID: "workspace-tags", Status: localtask.StatusActive}); err != nil {
		t.Fatal(err)
	}

	filter := localtask.TaskFilter{Status: statusPointer(localtask.StatusActive), Tags: []string{"ALPHA", "beta"}, WorkspaceID: stringPointer("workspace-tags")}
	listed, err := store.List(ctx, filter)
	if err != nil || len(listed) != 1 || listed[0].ID != first.ID {
		t.Fatalf("AND filtered list = %#v, %v", listed, err)
	}
	results, err := store.Search(ctx, "searchable", filter)
	if err != nil || len(results) != 1 || results[0].ID != first.ID {
		t.Fatalf("AND filtered search = %#v, %v", results, err)
	}
	assertTaskTags(t, results[0].Task, []string{"Alpha", "Beta"})

	missing, err := store.List(ctx, localtask.TaskFilter{Tags: []string{"missing"}})
	if err != nil || len(missing) != 0 {
		t.Fatalf("missing tag list = %#v, %v", missing, err)
	}
	empty, err := store.List(ctx, localtask.TaskFilter{})
	if err != nil || len(empty) != 3 {
		t.Fatalf("empty filter list = %#v, %v", empty, err)
	}
}

func TestLocalTaskStore_HydratesTagBatchesAndListsDeterministicSuggestions(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	emptyTags, err := store.ListTags(ctx)
	if err != nil || !reflect.DeepEqual(emptyTags, []string{}) {
		t.Fatalf("empty suggestions = %#v, %v", emptyTags, err)
	}
	const fixtureTimestamp = "2025-01-01 00:00:00"
	for index := 0; index <= sqliteBindChunkSize; index++ {
		id := "batch-" + string(rune(index+1000))
		if _, err := store.database.ExecContext(ctx, `INSERT INTO local_tasks
			(id, title, description, status, priority, created_at, updated_at) VALUES (?, ?, '', 'active', 'medium', ?, ?)`,
			id, id, fixtureTimestamp, fixtureTimestamp); err != nil {
			t.Fatalf("insert task %d: %v", index, err)
		}
	}
	firstChunkTaskID := "batch-" + string(rune(sqliteBindChunkSize-1+1000))
	secondChunkTaskID := "batch-" + string(rune(sqliteBindChunkSize+1000))
	if _, err := store.database.ExecContext(ctx, `INSERT INTO local_task_tags (local_task_id, tag, normalized_tag, position)
		VALUES (?, 'first', 'first', 0), (?, 'second', 'second', 1),
			(?, 'third', 'third', 0), (?, 'fourth', 'fourth', 1),
			(?, 'Zebra', 'zebra', 0), (?, 'Alpha', 'alpha', 0), (?, 'ALPHA', 'alpha', 0)`,
		firstChunkTaskID, firstChunkTaskID, secondChunkTaskID, secondChunkTaskID,
		"batch-Ϩ", "batch-ϩ", "batch-Ϫ"); err != nil {
		t.Fatal(err)
	}
	tasks, err := store.List(ctx, localtask.TaskFilter{})
	if err != nil || len(tasks) != sqliteBindChunkSize+1 {
		t.Fatalf("batch list count = %d, %v", len(tasks), err)
	}
	for index, task := range tasks {
		wantID := "batch-" + string(rune(index+1000))
		if task.ID != wantID {
			t.Fatalf("task %d ID = %q, want %q", index, task.ID, wantID)
		}
		if task.Tags == nil {
			t.Fatalf("task %q has nil tags", task.ID)
		}
	}
	assertTaskTags(t, tasks[sqliteBindChunkSize-1], []string{"first", "second"})
	assertTaskTags(t, tasks[sqliteBindChunkSize], []string{"third", "fourth"})
	tags, err := store.ListTags(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(tags, []string{"ALPHA", "first", "fourth", "second", "third", "Zebra"}) {
		t.Fatalf("suggestions = %#v", tags)
	}
}

func assertTaskTags(t *testing.T, task localtask.Task, want []string) {
	t.Helper()
	if task.Tags == nil || !reflect.DeepEqual(task.Tags, want) {
		t.Fatalf("task tags = %#v, want %#v", task.Tags, want)
	}
}

func createTaggedTask(t *testing.T, store *LocalTaskStore, title string, tags []string) localtask.Task {
	t.Helper()
	task, err := store.Create(context.Background(), localtask.Task{Title: title, Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, Tags: tags})
	if err != nil {
		t.Fatalf("create tagged task: %v", err)
	}
	return task
}

func statusPointer(status localtask.Status) *localtask.Status { return &status }
