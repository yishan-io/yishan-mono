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
	if tags := tagsValue.([]string); tags == nil || len(tags) != 0 {
		t.Fatalf("suggestion tags = %#v, want non-nil empty", tags)
	}
}
