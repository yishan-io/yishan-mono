package localtask

import (
	"context"
	"reflect"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

type projectionProjectResolver struct {
	requests map[string][]string
	projects map[string]domain.ProjectDisplay
}

func (resolver *projectionProjectResolver) ResolveTaskProject(context.Context, string, string) (domain.ProjectDisplay, bool, error) {
	return domain.ProjectDisplay{}, false, nil
}

func (resolver *projectionProjectResolver) ResolveTaskProjects(_ context.Context, projectIDsByOrganization map[string][]string) (map[string]domain.ProjectDisplay, error) {
	resolver.requests = projectIDsByOrganization
	return resolver.projects, nil
}

func TestService_ListProjectionReturnsTasksAndBulkResolvedProjects(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createProjectionWorkspace(t, workspaceStore, "workspace-1", "org-1", "project-1")
	createProjectionWorkspace(t, workspaceStore, "workspace-2", "org-1", "project-2")
	createProjectionWorkspace(t, workspaceStore, "workspace-3", "org-2", "project-3")
	createOrganizationProjectServiceTask(t, repository, "org-1", "project-1")
	createOrganizationProjectServiceTask(t, repository, "org-1", "project-2")
	createOrganizationProjectServiceTask(t, repository, "org-2", "project-3")
	createServiceTask(t, repository, "Global")
	createProjectServiceTask(t, repository, "deleted-project")
	resolver := &projectionProjectResolver{projects: map[string]domain.ProjectDisplay{
		"project-1": {ID: "project-1", Name: "One"},
		"project-3": {ID: "project-3", Name: "Three"},
	}}
	service.deps.ProjectResolver = resolver

	value, err := service.ListProjection(context.Background(), rpc.LocalTaskListProjectionParams{})
	if err != nil {
		t.Fatalf("ListProjection: %v", err)
	}
	projection := value.(domain.ListProjection)
	listed, err := repository.List(context.Background(), domain.TaskFilter{})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if got, want := taskIDs(projection.Tasks), taskIDs(listed); !reflect.DeepEqual(got, want) {
		t.Fatalf("task order = %v, want %v", got, want)
	}
	if projection.Total != len(listed) {
		t.Fatalf("total = %d, want %d", projection.Total, len(listed))
	}
	if got, want := resolver.requests, map[string][]string{"org-1": {"project-1", "project-2"}, "org-2": {"project-3"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("resolution requests = %#v, want %#v", got, want)
	}
	if got, want := projection.ProjectsByID, resolver.projects; !reflect.DeepEqual(got, want) {
		t.Fatalf("projectsById = %#v, want %#v", got, want)
	}
}

func createOrganizationProjectServiceTask(t *testing.T, repository domain.Repository, organizationID, projectID string) domain.Task {
	t.Helper()
	task, err := repository.Create(context.Background(), domain.Task{
		ProjectID: &projectID, OrganizationID: &organizationID, Title: "Project task", Status: domain.StatusActive, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func createProjectionWorkspace(t *testing.T, store *sqlite.WorkspaceStore, workspaceID, organizationID, projectID string) {
	t.Helper()
	if err := store.Create(context.Background(), &sqlite.Workspace{ID: workspaceID, OrganizationID: organizationID, ProjectID: projectID, Kind: "folder", Status: "active", LocalPath: t.TempDir(), State: "active"}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
}

func taskIDs(tasks []domain.Task) []string {
	ids := make([]string, len(tasks))
	for index, task := range tasks {
		ids[index] = task.ID
	}
	return ids
}

func TestService_ListProjectionResolvesOnlyPageProjects(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createProjectionWorkspace(t, workspaceStore, "workspace-1", "org-1", "project-1")
	createProjectionWorkspace(t, workspaceStore, "workspace-2", "org-1", "project-2")
	createOrganizationProjectServiceTask(t, repository, "org-1", "project-1")
	createOrganizationProjectServiceTask(t, repository, "org-1", "project-2")
	resolver := &projectionProjectResolver{projects: map[string]domain.ProjectDisplay{"project-1": {ID: "project-1", Name: "One"}, "project-2": {ID: "project-2", Name: "Two"}}}
	service.deps.ProjectResolver = resolver

	value, err := service.ListProjection(context.Background(), rpc.LocalTaskListProjectionParams{Offset: 0, Limit: 1})
	if err != nil {
		t.Fatalf("ListProjection: %v", err)
	}
	projection := value.(domain.ListProjection)
	if len(projection.Tasks) != 1 || projection.Tasks[0].ProjectID == nil {
		t.Fatalf("page tasks = %#v", projection.Tasks)
	}
	if got, want := resolver.requests, map[string][]string{"org-1": {*projection.Tasks[0].ProjectID}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("resolution requests = %#v, want %#v", got, want)
	}
}

func TestService_ListProjectionResolvesProjectScopedTaskWithoutWorkspace(t *testing.T) {
	service, _, repository := newTestService(t)
	createOrganizationProjectServiceTask(t, repository, "org-1", "project-1")
	legacyProjectID := "legacy-project"
	legacyTask, err := repository.Create(context.Background(), domain.Task{ProjectID: &legacyProjectID, Title: "Historical", Status: domain.StatusActive, Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("create historical task: %v", err)
	}
	resolver := &projectionProjectResolver{projects: map[string]domain.ProjectDisplay{"project-1": {ID: "project-1", Name: "One"}}}
	service.deps.ProjectResolver = resolver

	value, err := service.ListProjection(context.Background(), rpc.LocalTaskListProjectionParams{})
	if err != nil {
		t.Fatalf("ListProjection: %v", err)
	}
	projection := value.(domain.ListProjection)
	if got, want := resolver.requests, map[string][]string{"org-1": {"project-1"}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("resolution requests = %#v, want %#v", got, want)
	}
	if got, want := projection.ProjectsByID, resolver.projects; !reflect.DeepEqual(got, want) {
		t.Fatalf("projectsById = %#v, want %#v", got, want)
	}
	for _, projectedTask := range projection.Tasks {
		if projectedTask.ID != legacyTask.ID {
			continue
		}
		if projectedTask.ProjectID == nil || *projectedTask.ProjectID != legacyProjectID {
			t.Fatalf("legacy task project ID = %v, want %q", projectedTask.ProjectID, legacyProjectID)
		}
		return
	}
	t.Fatalf("legacy task %q missing from projection", legacyTask.ID)
}

func TestService_ListProjectionPreservesSearchAndFilters(t *testing.T) {
	service, _, repository := newTestService(t)
	matching := createServiceTask(t, repository, "Resolve daemon projection")
	completed := domain.StatusCompleted
	if _, err := repository.Update(context.Background(), matching.ID, domain.TaskUpdate{Status: &completed}); err != nil {
		t.Fatalf("complete task: %v", err)
	}
	createServiceTask(t, repository, "Resolve desktop projection")

	value, err := service.ListProjection(context.Background(), rpc.LocalTaskListProjectionParams{
		LocalTaskListParams: rpc.LocalTaskListParams{Status: &completed}, Query: "daemon",
	})
	if err != nil {
		t.Fatalf("ListProjection: %v", err)
	}
	projection := value.(domain.ListProjection)
	if got, want := taskIDs(projection.Tasks), []string{matching.ID}; !reflect.DeepEqual(got, want) || projection.Total != 1 {
		t.Fatalf("projection = %#v, want matching completed search row", projection)
	}
}
