package localtask

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

type detailProjectResolver struct {
	project domain.ProjectDisplay
	isFound bool
	calls   int
}

func (resolver *detailProjectResolver) ResolveTaskProject(_ context.Context, organizationID string, projectID string) (domain.ProjectDisplay, bool, error) {
	resolver.calls++
	if organizationID != "org-1" || projectID != "project-1" {
		return domain.ProjectDisplay{}, false, nil
	}
	return resolver.project, resolver.isFound, nil
}

func (resolver *detailProjectResolver) ResolveTaskProjects(context.Context, map[string][]string) (map[string]domain.ProjectDisplay, error) {
	return map[string]domain.ProjectDisplay{}, nil
}

func TestService_GetDetailsReturnsResolvedDisplays(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", Kind: "worktree",
		Name: testStringPointer("Feature branch"), Status: "active", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	resolver := &detailProjectResolver{project: domain.ProjectDisplay{
		ID: "project-1", Name: "Example", Icon: "code", Color: "#123456",
	}, isFound: true}
	service.deps.ProjectResolver = resolver
	task := createServiceTask(t, repository, "Task details")
	if _, err := repository.LinkWorkspace(context.Background(), domain.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: domain.StatusActive,
	}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}

	value, err := service.GetDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatalf("GetDetails: %v", err)
	}
	details := value.(domain.Details)
	if details.Task.ID != task.ID || len(details.Workspaces) != 1 || details.Workspaces[0] != (domain.WorkspaceDisplay{
		ID: "workspace-1", ProjectID: "project-1", Name: "Feature branch", Kind: domain.WorkspaceDisplayKindManaged, Status: domain.WorkspaceDisplayStatusActive,
	}) || details.Project == nil || *details.Project != resolver.project || resolver.calls != 1 {
		t.Fatalf("details = %#v, resolver calls = %d", details, resolver.calls)
	}
}

func TestService_GetDetailsResolvesUnlinkedProjectScopedTask(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", Kind: "folder",
		Status: "active", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	resolver := &detailProjectResolver{project: domain.ProjectDisplay{ID: "project-1", Name: "Example"}, isFound: true}
	service.deps.ProjectResolver = resolver
	task := createProjectServiceTask(t, repository, "project-1")

	value, err := service.GetDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatalf("GetDetails: %v", err)
	}
	details := value.(domain.Details)
	if details.Project == nil || *details.Project != resolver.project || resolver.calls != 1 {
		t.Fatalf("details = %#v, resolver calls = %d", details, resolver.calls)
	}
}

func TestService_GetDetailsPrefersTaskProjectOverLinkedWorkspaceProject(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	for _, localWorkspace := range []*sqlite.Workspace{
		{ID: "task-project-workspace", OrganizationID: "org-1", ProjectID: "project-1", Kind: "folder", Status: "active", LocalPath: t.TempDir(), State: "active"},
		{ID: "linked-workspace", OrganizationID: "org-2", ProjectID: "project-2", Kind: "folder", Status: "active", LocalPath: t.TempDir(), State: "active"},
	} {
		if err := workspaceStore.Create(context.Background(), localWorkspace); err != nil {
			t.Fatalf("create workspace: %v", err)
		}
	}
	resolver := &detailProjectResolver{project: domain.ProjectDisplay{ID: "project-1", Name: "Task project"}, isFound: true}
	service.deps.ProjectResolver = resolver
	task := createProjectServiceTask(t, repository, "project-1")
	if _, err := repository.LinkWorkspace(context.Background(), domain.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "linked-workspace", Status: domain.StatusActive,
	}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}

	value, err := service.GetDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatalf("GetDetails: %v", err)
	}
	details := value.(domain.Details)
	if details.Project == nil || *details.Project != resolver.project || resolver.calls != 1 {
		t.Fatalf("details = %#v, resolver calls = %d", details, resolver.calls)
	}
}

func TestService_GetDetailsOmitsUnresolvedHistoricalData(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "deleted-workspace")
	service.deps.WorkspaceStore = emptyDetailWorkspaceStore{}
	resolver := &detailProjectResolver{isFound: true}
	service.deps.ProjectResolver = resolver
	task := createServiceTask(t, repository, "Historical details")
	if _, err := repository.LinkWorkspace(context.Background(), domain.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "deleted-workspace", Status: domain.StatusCompleted,
	}); err != nil {
		t.Fatalf("link workspace: %v", err)
	}

	value, err := service.GetDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatalf("GetDetails: %v", err)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal details: %v", err)
	}
	if strings.Contains(string(encoded), "deleted-workspace") || !strings.Contains(string(encoded), `"workspaces":[]`) ||
		!strings.Contains(string(encoded), `"project":null`) || resolver.calls != 0 {
		t.Fatalf("details JSON = %s, resolver calls = %d", encoded, resolver.calls)
	}
}

func testStringPointer(value string) *string { return &value }

type emptyDetailWorkspaceStore struct{}

func (emptyDetailWorkspaceStore) List(context.Context) ([]workspace.StoredWorkspace, error) {
	return []workspace.StoredWorkspace{}, nil
}
func (emptyDetailWorkspaceStore) Update(context.Context, string, workspace.StoredWorkspaceUpdate) error {
	return nil
}
func (emptyDetailWorkspaceStore) ListPRsByWorkspace(context.Context, string) ([]workspace.StoredPullRequest, error) {
	return nil, nil
}
func (emptyDetailWorkspaceStore) UpsertPR(context.Context, *workspace.StoredPullRequest) error {
	return nil
}
func (emptyDetailWorkspaceStore) ResolvePR(context.Context, string, string) error { return nil }

func TestWorkspaceDisplayKind_MapsInternalKindsToDetailWireContract(t *testing.T) {
	testCases := []struct {
		name string
		kind string
		want domain.WorkspaceDisplayKind
	}{
		{name: "worktree is managed", kind: "worktree", want: domain.WorkspaceDisplayKindManaged},
		{name: "primary is local", kind: "primary", want: domain.WorkspaceDisplayKindLocal},
		{name: "folder remains folder", kind: "folder", want: domain.WorkspaceDisplayKindFolder},
		{name: "unknown legacy kind is managed", kind: "legacy", want: domain.WorkspaceDisplayKindManaged},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := workspaceDisplayKind(testCase.kind); got != testCase.want {
				t.Fatalf("workspaceDisplayKind(%q) = %q, want %q", testCase.kind, got, testCase.want)
			}
		})
	}
}

func TestService_GetDetailsExcludesUnlinkedWorkspaceAndProjectDisplay(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", Kind: "worktree",
		Name: testStringPointer("Feature branch"), Status: "active", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	resolver := &detailProjectResolver{project: domain.ProjectDisplay{ID: "project-1", Name: "Example"}, isFound: true}
	service.deps.ProjectResolver = resolver
	task := createServiceTask(t, repository, "Unlinked details")
	link, err := repository.LinkWorkspace(context.Background(), domain.WorkspaceLink{
		LocalTaskID: task.ID, WorkspaceID: "workspace-1", Status: domain.StatusActive,
	})
	if err != nil {
		t.Fatalf("link workspace: %v", err)
	}
	if err := repository.UnlinkWorkspace(context.Background(), link.ID); err != nil {
		t.Fatalf("unlink workspace: %v", err)
	}

	value, err := service.GetDetails(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil {
		t.Fatalf("GetDetails: %v", err)
	}
	details := value.(domain.Details)
	if len(details.Workspaces) != 0 || details.Project != nil || resolver.calls != 0 {
		t.Fatalf("details = %#v, resolver calls = %d", details, resolver.calls)
	}
}

func TestWorkspaceDisplayStatus_MapsPersistedLifecycleToDetailWireContract(t *testing.T) {
	testCases := []struct {
		name   string
		status string
		want   domain.WorkspaceDisplayStatus
	}{
		{name: "provisioning", status: "provisioning", want: domain.WorkspaceDisplayStatusProvisioning},
		{name: "active", status: "active", want: domain.WorkspaceDisplayStatusActive},
		{name: "closing", status: "closing", want: domain.WorkspaceDisplayStatusClosing},
		{name: "closed", status: "closed", want: domain.WorkspaceDisplayStatusClosed},
		{name: "unknown legacy status is closed", status: "legacy", want: domain.WorkspaceDisplayStatusClosed},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := workspaceDisplayStatus(testCase.status); got != testCase.want {
				t.Fatalf("workspaceDisplayStatus(%q) = %q, want %q", testCase.status, got, testCase.want)
			}
		})
	}
}
