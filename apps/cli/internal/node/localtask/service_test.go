package localtask

import (
	"context"
	"errors"
	"slices"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_CreateDefaultsAndCompletesTask(t *testing.T) {
	service, _, _ := newTestService(t)

	createdValue, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Ship RPCs"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	created := createdValue.(domain.Task)
	if created.ID == "" || created.Status != domain.StatusActive || created.Priority != domain.PriorityMedium || created.Tags == nil {
		t.Fatalf("created task = %#v", created)
	}

	completed := domain.StatusCompleted
	updatedValue, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, Status: &completed})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	updated := updatedValue.(domain.Task)
	if updated.Status != domain.StatusCompleted || updated.CompletedAt == nil {
		t.Fatalf("updated task = %#v", updated)
	}
}

func TestService_CreateNotifiesTaskContextLifecycle(t *testing.T) {
	service, _, _ := newTestService(t)
	calls := 0
	service.deps.TaskContextsChanged = func() { calls++ }

	if _, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Register context"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if calls != 1 {
		t.Fatalf("task context lifecycle calls = %d, want 1", calls)
	}
}

func TestService_UpdateTitleNotifiesTaskContextLifecycle(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Old title")
	var notifiedTaskID string
	var notifiedTitle string
	service.deps.TaskTitleChanged = func(_ context.Context, taskID string, taskTitle string) {
		notifiedTaskID = taskID
		notifiedTitle = taskTitle
	}

	newTitle := "New title"
	if _, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: task.ID, Title: &newTitle}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if notifiedTaskID != task.ID || notifiedTitle != newTitle {
		t.Fatalf("title notification = (%q, %q), want (%q, %q)", notifiedTaskID, notifiedTitle, task.ID, newTitle)
	}
}

func TestService_CreateRejectsInvalidMetadata(t *testing.T) {
	service, _, _ := newTestService(t)

	_, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: " ", Priority: "urgent"})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("Create error = %v, want invalid task", err)
	}
}

func TestService_LinkWorkspaceRequiresPersistedLocalWorkspace(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	created, err := repository.Create(context.Background(), domain.Task{
		Title: "Link me", Status: domain.StatusActive, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	_, err = service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: created.ID, WorkspaceID: "missing",
	})
	var workspaceErr *workspace.Error
	if !errors.As(err, &workspaceErr) || workspaceErr.Code != workspace.ErrCodeNotFound {
		t.Fatalf("LinkWorkspace error = %v, want workspace not found", err)
	}

	createWorkspace(t, workspaceStore, "workspace-1")
	linkedValue, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: created.ID, WorkspaceID: "workspace-1",
	})
	if err != nil {
		t.Fatalf("LinkWorkspace: %v", err)
	}
	linked := linkedValue.(domain.WorkspaceLink)
	if linked.WorkspaceID != "workspace-1" {
		t.Fatalf("linked workspace = %#v", linked)
	}
}

func newTestService(t *testing.T) (*Service, *sqlite.WorkspaceStore, *sqlite.LocalTaskStore) {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	workspaceStore := sqlite.NewWorkspaceStore(database)
	repository := sqlite.NewLocalTaskStore(database)
	service := NewService(Deps{Repository: repository, WorkspaceStore: sqlite.NewStore(workspaceStore)})
	return service, workspaceStore, repository
}

func createWorkspace(t *testing.T, store *sqlite.WorkspaceStore, workspaceID string) {
	t.Helper()
	err := store.Create(context.Background(), &sqlite.Workspace{
		ID: workspaceID, Kind: "folder", Status: "active", LocalPath: "/tmp/" + workspaceID, State: "active",
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
}

func TestService_ListNormalizesWorkspaceFilter(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	task := createServiceTask(t, repository, "Filtered task")
	if _, err := repository.LinkWorkspace(context.Background(), domain.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: domain.StatusActive,
	}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}
	workspaceID := "  workspace-1  "
	listedValue, err := service.List(context.Background(), rpc.LocalTaskListParams{WorkspaceID: &workspaceID})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	listed := listedValue.([]domain.Task)
	if len(listed) != 1 || listed[0].ID != task.ID {
		t.Fatalf("listed tasks = %#v", listed)
	}
}

func createServiceTask(t *testing.T, repository domain.Repository, title string) domain.Task {
	t.Helper()
	task, err := repository.Create(context.Background(), domain.Task{
		Title: title, Status: domain.StatusActive, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	return task
}

func TestService_MapsTagsAndListsSuggestions(t *testing.T) {
	service, _, _ := newTestService(t)
	createdValue, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{
		Title: "Tagged", Tags: []string{"  First  ", "second"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	created := createdValue.(domain.Task)
	if got, want := created.Tags, []string{"First", "second"}; !slices.Equal(got, want) {
		t.Fatalf("created tags = %#v, want %#v", got, want)
	}
	listedValue, err := service.List(context.Background(), rpc.LocalTaskListParams{Tags: []string{" second "}})
	if err != nil || len(listedValue.([]domain.Task)) != 1 {
		t.Fatalf("List tags = %#v, %v", listedValue, err)
	}
	searchedValue, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{
		Query: "Tagged", LocalTaskListParams: rpc.LocalTaskListParams{Tags: []string{"First", "second"}},
	})
	if err != nil || len(searchedValue.([]domain.SearchResult)) != 1 {
		t.Fatalf("Search tags = %#v, %v", searchedValue, err)
	}

	cleared := []string{}
	updatedValue, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, Tags: &cleared})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated := updatedValue.(domain.Task); updated.Tags == nil || len(updated.Tags) != 0 {
		t.Fatalf("updated tags = %#v, want non-nil empty", updated.Tags)
	}

	tagsValue, err := service.ListTags(context.Background())
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if tags := tagsValue.([]string); !slices.Equal(tags, []string{"First", "second"}) {
		t.Fatalf("suggestion tags = %#v, want retained catalog names", tags)
	}
}

func TestService_ListsTagCatalogAndUpdatesColor(t *testing.T) {
	service, _, _ := newTestService(t)
	if _, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{
		Title: "Tagged", Tags: []string{"  First  "},
	}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	catalogValue, err := service.ListTagCatalog(context.Background())
	if err != nil {
		t.Fatalf("ListTagCatalog: %v", err)
	}
	catalog := catalogValue.([]domain.Tag)
	if len(catalog) != 1 || catalog[0].Key != "first" || catalog[0].Name != "First" || catalog[0].Color != nil {
		t.Fatalf("catalog = %#v", catalog)
	}

	blue := domain.TagColorBlue
	updatedValue, err := service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{
		Key: "first", Color: &blue,
	})
	if err != nil {
		t.Fatalf("UpdateTagColor: %v", err)
	}
	updated := updatedValue.(domain.Tag)
	if updated.Color == nil || *updated.Color != blue {
		t.Fatalf("updated catalog tag = %#v", updated)
	}

	custom := "#123456"
	newTagValue, err := service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{
		Tag: " Cafe\u0301 ", CustomColor: &custom,
	})
	if err != nil {
		t.Fatalf("UpdateTagColor new display tag: %v", err)
	}
	newTag := newTagValue.(domain.Tag)
	if newTag.Key != "café" || newTag.Name != "Café" || newTag.CustomColor == nil || *newTag.CustomColor != custom {
		t.Fatalf("new display tag catalog entry = %#v", newTag)
	}

	_, err = service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{Key: " first"})
	if !errors.Is(err, domain.ErrInvalidTagKey) {
		t.Fatalf("invalid key error = %v, want invalid tag key", err)
	}

	invalid := "magenta"
	_, err = service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{Key: "first", Color: &invalid})
	if !errors.Is(err, domain.ErrInvalidTagColor) {
		t.Fatalf("invalid color error = %v, want invalid tag color", err)
	}
}

func TestService_MapsTagIDFilters(t *testing.T) {
	service, _, repository := newTestService(t)
	first, err := repository.CreateTag(context.Background(), domain.TagCreate{Name: "First"})
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if _, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Tagged", TagRefs: []domain.TagRef{{ID: first.ID}}}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	listValue, err := service.List(context.Background(), rpc.LocalTaskListParams{TagIDs: []string{first.ID}})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(listValue.([]domain.Task)) != 1 {
		t.Fatalf("List tag IDs = %#v, want one task", listValue)
	}
	searchValue, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{Query: "Tagged", LocalTaskListParams: rpc.LocalTaskListParams{TagIDs: []string{first.ID}}})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(searchValue.([]domain.SearchResult)) != 1 {
		t.Fatalf("Search tag IDs = %#v, want one task", searchValue)
	}
	for _, operation := range []struct {
		name string
		call func() error
	}{
		{"list", func() error {
			_, err := service.List(context.Background(), rpc.LocalTaskListParams{TagIDs: []string{"missing"}})
			return err
		}},
		{"search", func() error {
			_, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{
				Query: "Tagged", LocalTaskListParams: rpc.LocalTaskListParams{TagIDs: []string{first.ID, "missing"}},
			})
			return err
		}},
	} {
		t.Run(operation.name+" rejects unknown tag IDs", func(t *testing.T) {
			if err := operation.call(); !errors.Is(err, domain.ErrTagNotFound) {
				t.Fatalf("error = %v, want tag not found", err)
			}
		})
	}
	for _, operation := range []struct {
		name string
		call func() error
	}{
		{"list", func() error {
			_, err := service.List(context.Background(), rpc.LocalTaskListParams{TagIDs: []string{first.ID, first.ID}})
			return err
		}},
		{"search", func() error {
			_, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{
				Query: "Tagged", LocalTaskListParams: rpc.LocalTaskListParams{TagIDs: []string{first.ID, first.ID}},
			})
			return err
		}},
	} {
		t.Run(operation.name+" rejects duplicate tag IDs", func(t *testing.T) {
			if err := operation.call(); !errors.Is(err, domain.ErrInvalidTag) {
				t.Fatalf("error = %v, want invalid tag", err)
			}
		})
	}
	if _, err := service.List(context.Background(), rpc.LocalTaskListParams{TagIDs: []string{" tag-1 "}}); !errors.Is(err, domain.ErrInvalidTag) {
		t.Fatalf("List invalid tag ID error = %v, want invalid tag", err)
	}
}

func TestService_CreatesAndUpdatesTasksByTagReferenceIDs(t *testing.T) {
	service, _, repository := newTestService(t)
	first, err := repository.CreateTag(context.Background(), domain.TagCreate{Name: "First"})
	if err != nil {
		t.Fatalf("create first tag: %v", err)
	}
	second, err := repository.CreateTag(context.Background(), domain.TagCreate{Name: "Second"})
	if err != nil {
		t.Fatalf("create second tag: %v", err)
	}
	refs := []domain.TagRef{{ID: first.ID}}
	createdValue, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Tag IDs", TagRefs: refs})
	if err != nil {
		t.Fatalf("create with references: %v", err)
	}
	created := createdValue.(domain.Task)
	if !slices.Equal(created.TagRefs, []domain.TagRef{{ID: first.ID, Name: "First"}}) {
		t.Fatalf("created refs = %#v", created.TagRefs)
	}
	updatedRefs := []domain.TagRef{{ID: second.ID}}
	updatedValue, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, TagRefs: &updatedRefs})
	if err != nil {
		t.Fatalf("update with references: %v", err)
	}
	if updated := updatedValue.(domain.Task); !slices.Equal(updated.TagRefs, []domain.TagRef{{ID: second.ID, Name: "Second"}}) {
		t.Fatalf("updated refs = %#v", updated.TagRefs)
	}

	emptyLegacy := []string{}
	_, err = service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Mixed tags", Tags: emptyLegacy, TagRefs: updatedRefs})
	if !errors.Is(err, domain.ErrInvalidTag) {
		t.Fatalf("mixed create error = %v, want invalid tag", err)
	}
	_, err = service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, Tags: &emptyLegacy, TagRefs: &updatedRefs})
	if !errors.Is(err, domain.ErrInvalidTag) {
		t.Fatalf("mixed update error = %v, want invalid tag", err)
	}
}

func TestService_MutatesStableTagIDsAndReportsMerges(t *testing.T) {
	service, _, _ := newTestService(t)
	firstValue, err := service.CreateTag(context.Background(), rpc.LocalTaskCreateTagParams{Name: "First"})
	if err != nil {
		t.Fatalf("CreateTag first: %v", err)
	}
	first := firstValue.(domain.Tag)
	secondValue, err := service.CreateTag(context.Background(), rpc.LocalTaskCreateTagParams{Name: "Second"})
	if err != nil {
		t.Fatalf("CreateTag second: %v", err)
	}
	second := secondValue.(domain.Tag)

	renamedValue, err := service.RenameTag(context.Background(), rpc.LocalTaskRenameTagParams{ID: second.ID, Name: "First"})
	if err != nil {
		t.Fatalf("RenameTag merge: %v", err)
	}
	renamed := renamedValue.(rpc.LocalTaskRenameTagResult)
	if renamed.Tag.ID != first.ID || renamed.RemovedTagID == nil || *renamed.RemovedTagID != second.ID {
		t.Fatalf("RenameTag response = %#v", renamed)
	}

	deletedValue, err := service.DeleteTag(context.Background(), rpc.LocalTaskDeleteTagParams{ID: first.ID})
	if err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
	if deleted := deletedValue.(rpc.LocalTaskDeleteTagResult); deleted.DeletedTagID != first.ID {
		t.Fatalf("DeleteTag response = %#v", deleted)
	}
	if _, err := service.DeleteTag(context.Background(), rpc.LocalTaskDeleteTagParams{ID: second.ID}); !errors.Is(err, domain.ErrTagNotFound) {
		t.Fatalf("DeleteTag stale ID error = %v, want tag not found", err)
	}
	if _, err := service.RenameTag(context.Background(), rpc.LocalTaskRenameTagParams{ID: second.ID, Name: "Renamed"}); !errors.Is(err, domain.ErrTagNotFound) {
		t.Fatalf("RenameTag stale ID error = %v, want tag not found", err)
	}
	blue := domain.TagColorBlue
	if _, err := service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{ID: second.ID, Color: &blue}); !errors.Is(err, domain.ErrTagNotFound) {
		t.Fatalf("UpdateTagColor stale ID error = %v, want tag not found", err)
	}
}

func TestService_TagMutationsRejectInvalidParameters(t *testing.T) {
	service, _, _ := newTestService(t)
	if _, err := service.CreateTag(context.Background(), rpc.LocalTaskCreateTagParams{Name: " "}); !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("CreateTag invalid name error = %v, want invalid task", err)
	}
	for _, id := range []string{"", " tag-1 ", "\t"} {
		if _, err := service.RenameTag(context.Background(), rpc.LocalTaskRenameTagParams{ID: id, Name: "Name"}); !errors.Is(err, domain.ErrInvalidTag) {
			t.Fatalf("RenameTag invalid ID %q error = %v, want invalid tag", id, err)
		}
		if _, err := service.DeleteTag(context.Background(), rpc.LocalTaskDeleteTagParams{ID: id}); !errors.Is(err, domain.ErrInvalidTag) {
			t.Fatalf("DeleteTag invalid ID %q error = %v, want invalid tag", id, err)
		}
		blue := domain.TagColorBlue
		if _, err := service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{ID: id, Color: &blue}); !errors.Is(err, domain.ErrInvalidTag) {
			t.Fatalf("UpdateTagColor invalid ID %q error = %v, want invalid tag", id, err)
		}
	}
}

func TestService_UpdateTagColorRejectsMixedSelectors(t *testing.T) {
	service, _, _ := newTestService(t)
	blue := domain.TagColorBlue

	_, err := service.UpdateTagColor(context.Background(), rpc.LocalTaskUpdateTagColorParams{
		ID: "tag-1", Tag: "stale", Color: &blue,
	})
	if !errors.Is(err, domain.ErrInvalidTag) {
		t.Fatalf("UpdateTagColor error = %v, want invalid tag", err)
	}
}
