package sqlite

import (
	"context"
	"errors"
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
	if err != nil || !reflect.DeepEqual(emptyTags, []localtask.Tag{}) {
		t.Fatalf("empty catalog = %#v, %v", emptyTags, err)
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
	if len(tags) != 0 {
		t.Fatalf("catalog entries = %#v, want none for direct assignment fixtures", tags)
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

func TestLocalTaskStore_RetainsCatalogColorsAcrossAssignments(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	created := createTaggedTask(t, store, "Colored", []string{" Alpha "})
	catalog, err := store.ListTags(ctx)
	if err != nil || !reflect.DeepEqual(catalog, []localtask.Tag{{Key: "alpha", Name: "Alpha", Aliases: []string{"Alpha"}, Color: nil}}) {
		t.Fatalf("initial catalog = %#v, %v", catalog, err)
	}

	color := localtask.TagColorBlue
	updated, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{Color: &color})
	if err != nil || updated.Color == nil || *updated.Color != color || !reflect.DeepEqual(updated.Aliases, []string{"Alpha"}) {
		t.Fatalf("set catalog color = %#v, %v", updated, err)
	}
	clear := []string{}
	if _, err := store.Update(ctx, created.ID, localtask.TaskUpdate{Tags: &clear}); err != nil {
		t.Fatalf("clear task assignments: %v", err)
	}
	catalog, err = store.ListTags(ctx)
	if err != nil || len(catalog) != 1 || catalog[0].Color == nil || *catalog[0].Color != color {
		t.Fatalf("retained catalog = %#v, %v", catalog, err)
	}

	if _, err := store.UpdateTagColor(ctx, " Alpha", localtask.TagColorUpdate{Color: &color}); !errors.Is(err, localtask.ErrInvalidTagKey) {
		t.Fatalf("invalid key shape error = %v", err)
	}
	invalid := "magenta"
	if _, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{Color: &invalid}); !errors.Is(err, localtask.ErrInvalidTagColor) {
		t.Fatalf("invalid color error = %v", err)
	}
	if _, err := store.UpdateTagColor(ctx, "missing", localtask.TagColorUpdate{Color: &color}); !errors.Is(err, localtask.ErrTagNotFound) {
		t.Fatalf("missing catalog entry error = %v", err)
	}
	cleared, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{})
	if err != nil || cleared.Color != nil {
		t.Fatalf("clear catalog color = %#v, %v", cleared, err)
	}
}

func TestLocalTaskStore_ListsEveryPersistedDisplayAliasForCatalogKey(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	_ = createTaggedTask(t, store, "First", []string{"Straße"})
	_ = createTaggedTask(t, store, "Second", []string{"STRASSE"})

	catalog, err := store.ListTags(ctx)
	if err != nil {
		t.Fatalf("list catalog: %v", err)
	}
	if !reflect.DeepEqual(catalog, []localtask.Tag{{
		Key: "strasse", Name: "Straße", Aliases: []string{"STRASSE", "Straße"}, Color: nil,
	}}) {
		t.Fatalf("catalog aliases = %#v", catalog)
	}
}

func TestLocalTaskStore_RetainsEveryAliasAfterFinalAssignmentIsRemoved(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	first := createTaggedTask(t, store, "First", []string{"Straße"})
	second := createTaggedTask(t, store, "Second", []string{"STRASSE"})
	clear := []string{}
	if _, err := store.Update(ctx, first.ID, localtask.TaskUpdate{Tags: &clear}); err != nil {
		t.Fatalf("clear first assignments: %v", err)
	}
	if _, err := store.Update(ctx, second.ID, localtask.TaskUpdate{Tags: &clear}); err != nil {
		t.Fatalf("clear final assignments: %v", err)
	}

	catalog, err := store.ListTags(ctx)
	if err != nil {
		t.Fatalf("list catalog: %v", err)
	}
	if !reflect.DeepEqual(catalog, []localtask.Tag{{
		Key: "strasse", Name: "Straße", Aliases: []string{"STRASSE", "Straße"}, Color: nil,
	}}) {
		t.Fatalf("retained catalog aliases = %#v", catalog)
	}
}

func TestLocalTaskStore_RollsBackCatalogAndAssignmentWritesTogether(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	if _, err := store.database.Exec(`CREATE TRIGGER abort_catalog BEFORE INSERT ON local_task_tags
		WHEN NEW.tag = 'abort' BEGIN SELECT RAISE(ABORT, 'tag rejected'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create(ctx, localtask.Task{Title: "Rejected", Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, Tags: []string{"abort"}}); err == nil {
		t.Fatal("expected create to abort")
	}
	catalog, err := store.ListTags(ctx)
	if err != nil || len(catalog) != 0 {
		t.Fatalf("rolled back catalog = %#v, %v", catalog, err)
	}
}

func TestLocalTaskStore_PreservesCatalogIdentityAndColorAfterRestart(t *testing.T) {
	ctx := context.Background()
	profileDir := t.TempDir()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	store := NewLocalTaskStore(database)
	_ = createTaggedTask(t, store, "First", []string{"Straße"})
	color := localtask.TagColorPurple
	if _, err := store.UpdateTagColor(ctx, "strasse", localtask.TagColorUpdate{Color: &color}); err != nil {
		t.Fatalf("set catalog color: %v", err)
	}
	_ = createTaggedTask(t, store, "Second", []string{"STRASSE"})
	if err := database.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}

	database, err = Open(profileDir)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatalf("rerun migration: %v", err)
	}
	catalog, err := NewLocalTaskStore(database).ListTags(ctx)
	if err != nil || len(catalog) != 1 {
		t.Fatalf("restarted catalog = %#v, %v", catalog, err)
	}
	if catalog[0].Key != "strasse" || catalog[0].Name != "Straße" || !reflect.DeepEqual(catalog[0].Aliases, []string{"STRASSE", "Straße"}) || catalog[0].Color == nil || *catalog[0].Color != color {
		t.Fatalf("restarted catalog entry = %#v", catalog[0])
	}
}

func TestLocalTaskStore_CustomTagColorReplacesPresetAndClears(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	createTaggedTask(t, store, "Colored", []string{"alpha"})
	preset := localtask.TagColorBlue
	if _, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{Color: &preset}); err != nil {
		t.Fatalf("set preset: %v", err)
	}
	custom := "#a1B2c3"
	updated, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{CustomColor: &custom})
	if err != nil || updated.Color != nil || updated.CustomColor == nil || *updated.CustomColor != custom {
		t.Fatalf("set custom = %#v, %v", updated, err)
	}
	invalid := "#12345"
	if _, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{CustomColor: &invalid}); !errors.Is(err, localtask.ErrInvalidTagColor) {
		t.Fatalf("invalid custom color error = %v", err)
	}
	cleared, err := store.UpdateTagColor(ctx, "alpha", localtask.TagColorUpdate{})
	if err != nil || cleared.Color != nil || cleared.CustomColor != nil {
		t.Fatalf("clear colors = %#v, %v", cleared, err)
	}
}

func TestLocalTaskStore_CustomTagColorSurvivesDatabaseRestart(t *testing.T) {
	profileDir := t.TempDir()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	store := NewLocalTaskStore(database)
	createTaggedTask(t, store, "Colored", []string{"alpha"})
	custom := "#123456"
	if _, err := store.UpdateTagColor(context.Background(), "alpha", localtask.TagColorUpdate{CustomColor: &custom}); err != nil {
		t.Fatalf("set custom: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}
	assertRestartedCustomTagColor(t, profileDir, custom)
}

func assertRestartedCustomTagColor(t *testing.T, profileDir string, want string) {
	t.Helper()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("remigrate database: %v", err)
	}
	catalog, err := NewLocalTaskStore(database).ListTags(context.Background())
	if err != nil || len(catalog) != 1 || catalog[0].CustomColor == nil || *catalog[0].CustomColor != want {
		t.Fatalf("restarted catalog = %#v, %v", catalog, err)
	}
}

func TestLocalTaskStore_EnsuresCatalogEntryAndAliasesWhenColoringNewDisplayTag(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	preset := localtask.TagColorBlue
	first, err := store.UpdateTagColor(ctx, "", localtask.TagColorUpdate{DisplayName: stringPointer(" Cafe\u0301 "), Color: &preset})
	if err != nil {
		t.Fatalf("set new preset color: %v", err)
	}
	if first.Key != "café" || first.Name != "Café" || !reflect.DeepEqual(first.Aliases, []string{"Café"}) || first.Color == nil || *first.Color != preset {
		t.Fatalf("new catalog entry = %#v", first)
	}
	custom := "#123456"
	second, err := store.UpdateTagColor(ctx, "", localtask.TagColorUpdate{DisplayName: stringPointer("CAFÉ"), CustomColor: &custom})
	if err != nil {
		t.Fatalf("set new custom color: %v", err)
	}
	if second.Key != "café" || !reflect.DeepEqual(second.Aliases, []string{"CAFÉ", "Café"}) || second.Color != nil || second.CustomColor == nil || *second.CustomColor != custom {
		t.Fatalf("updated catalog entry = %#v", second)
	}
}
