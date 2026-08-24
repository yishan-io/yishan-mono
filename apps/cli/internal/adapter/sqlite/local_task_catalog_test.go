package sqlite

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/localtask"
)

func TestLocalTaskStore_RenameTagWithSameNormalizedKeyUpdatesCanonicalNameAndAlias(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	created, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Alpha"})
	if err != nil {
		t.Fatalf("create tag: %v", err)
	}

	renamed, err := store.RenameTag(ctx, created.ID, "ALPHA")
	if err != nil {
		t.Fatalf("rename tag: %v", err)
	}
	if renamed.ID != created.ID || renamed.Name != "ALPHA" || !reflect.DeepEqual(renamed.Aliases, []string{"ALPHA", "Alpha"}) {
		t.Fatalf("renamed tag = %#v", renamed)
	}
}

func TestLocalTaskStore_RenameTagMergeRetainsRequestedAliasColorsReferencesAndOrder(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	target, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Target"})
	if err != nil {
		t.Fatalf("create target: %v", err)
	}
	source, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Source"})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	targetColor := "#3B82F6"
	if _, err := store.UpdateTagColor(ctx, target.ID, localtask.TagColorUpdate{Color: &targetColor}); err != nil {
		t.Fatalf("color target: %v", err)
	}
	sourceColor := "#EF4444"
	if _, err := store.UpdateTagColor(ctx, source.ID, localtask.TagColorUpdate{Color: &sourceColor}); err != nil {
		t.Fatalf("color source: %v", err)
	}
	task := createTestLocalTask(t, store, "Tagged")
	refs := []localtask.TagRef{{ID: source.ID}, {ID: target.ID}}
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{TagRefs: &refs}); err != nil {
		t.Fatalf("set tag references: %v", err)
	}

	merged, err := store.RenameTag(ctx, source.ID, "TARGET")
	if err != nil {
		t.Fatalf("merge by rename: %v", err)
	}
	if merged.ID != target.ID || merged.Color == nil || *merged.Color != targetColor ||
		!reflect.DeepEqual(merged.Aliases, []string{"Source", "TARGET", "Target"}) {
		t.Fatalf("merged tag = %#v", merged)
	}
	loaded, err := store.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("get merged task: %v", err)
	}
	if !reflect.DeepEqual(loaded.TagRefs, []localtask.TagRef{{ID: target.ID, Name: "Target"}}) {
		t.Fatalf("merged references = %#v", loaded.TagRefs)
	}
}

func TestLocalTaskStore_UpdateTagColorRollsBackNewTagWhenColorUpdateFails(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	if _, err := store.database.Exec(`CREATE TRIGGER abort_new_tag_color BEFORE UPDATE OF color ON local_task_tag_catalog
		WHEN NEW.tag = 'Atomic' BEGIN SELECT RAISE(ABORT, 'color rejected'); END`); err != nil {
		t.Fatal(err)
	}
	color := "#3B82F6"
	_, err := store.UpdateTagColor(ctx, "", localtask.TagColorUpdate{DisplayName: stringPointer("Atomic"), Color: &color})
	if err == nil {
		t.Fatal("expected color update to abort")
	}
	catalog, listErr := store.ListTags(ctx)
	if listErr != nil || len(catalog) != 0 {
		t.Fatalf("catalog after rejected color = %#v, %v; update error = %v", catalog, listErr, err)
	}
}

func TestLocalTaskStore_MergeTagsTransfersSourceColorAndPreservesReferenceOrder(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	first, err := store.CreateTag(ctx, localtask.TagCreate{Name: "First"})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	target, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Target"})
	if err != nil {
		t.Fatalf("create target: %v", err)
	}
	source, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Source"})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	sourceColor := "#EF4444"
	if _, err := store.UpdateTagColor(ctx, source.ID, localtask.TagColorUpdate{Color: &sourceColor}); err != nil {
		t.Fatalf("color source: %v", err)
	}
	task := createTestLocalTask(t, store, "Ordered")
	refs := []localtask.TagRef{{ID: first.ID}, {ID: source.ID}}
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{TagRefs: &refs}); err != nil {
		t.Fatalf("set tag references: %v", err)
	}

	merged, err := store.MergeTags(ctx, target.ID, source.ID)
	if err != nil {
		t.Fatalf("merge tags: %v", err)
	}
	if merged.Color == nil || *merged.Color != sourceColor {
		t.Fatalf("merged source color = %#v", merged)
	}
	loaded, err := store.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("get merged task: %v", err)
	}
	if !reflect.DeepEqual(loaded.TagRefs, []localtask.TagRef{{ID: first.ID, Name: "First"}, {ID: target.ID, Name: "Target"}}) {
		t.Fatalf("merged references = %#v", loaded.TagRefs)
	}
}

func TestLocalTaskStore_MergeTagsKeepsFirstSourceOrTargetOccurrence(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	source, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Source"})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	unrelated, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Unrelated"})
	if err != nil {
		t.Fatalf("create unrelated: %v", err)
	}
	target, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Target"})
	if err != nil {
		t.Fatalf("create target: %v", err)
	}
	task := createTestLocalTask(t, store, "Ordered")
	refs := []localtask.TagRef{{ID: source.ID}, {ID: unrelated.ID}, {ID: target.ID}}
	if _, err := store.Update(ctx, task.ID, localtask.TaskUpdate{TagRefs: &refs}); err != nil {
		t.Fatalf("set tag references: %v", err)
	}
	if _, err := store.MergeTags(ctx, target.ID, source.ID); err != nil {
		t.Fatalf("merge tags: %v", err)
	}
	loaded, err := store.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("get merged task: %v", err)
	}
	want := []localtask.TagRef{{ID: target.ID, Name: "Target"}, {ID: unrelated.ID, Name: "Unrelated"}}
	if !reflect.DeepEqual(loaded.TagRefs, want) {
		t.Fatalf("merged references = %#v, want %#v", loaded.TagRefs, want)
	}
}

func TestLocalTaskStore_CreatesAndUpdatesTagReferencesWithTypedValidation(t *testing.T) {
	ctx := context.Background()
	store, _ := openTestLocalTaskStore(t)
	first, err := store.CreateTag(ctx, localtask.TagCreate{Name: "First"})
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := store.CreateTag(ctx, localtask.TagCreate{Name: "Second"})
	if err != nil {
		t.Fatalf("create second: %v", err)
	}
	if _, err := store.Create(ctx, localtask.Task{Title: "Unknown IDs", Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, TagRefs: []localtask.TagRef{{ID: "missing"}}}); !errors.Is(err, localtask.ErrTagNotFound) {
		t.Fatalf("unknown create reference error = %v, want tag not found", err)
	}
	created, err := store.Create(ctx, localtask.Task{Title: "Created by IDs", Status: localtask.StatusActive,
		Priority: localtask.PriorityMedium, TagRefs: []localtask.TagRef{{ID: first.ID}, {ID: second.ID}}})
	if err != nil {
		t.Fatalf("create with references: %v", err)
	}
	wantCreated := []localtask.TagRef{{ID: first.ID, Name: "First"}, {ID: second.ID, Name: "Second"}}
	if !reflect.DeepEqual(created.TagRefs, wantCreated) {
		t.Fatalf("created references = %#v, want %#v", created.TagRefs, wantCreated)
	}

	unknown := []localtask.TagRef{{ID: "missing"}}
	if _, err := store.Update(ctx, created.ID, localtask.TaskUpdate{TagRefs: &unknown}); !errors.Is(err, localtask.ErrTagNotFound) {
		t.Fatalf("unknown update reference error = %v, want tag not found", err)
	}
	persisted, err := store.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("get task after rejected update: %v", err)
	}
	if !reflect.DeepEqual(persisted.TagRefs, wantCreated) {
		t.Fatalf("references after rejected update = %#v", persisted.TagRefs)
	}
}
