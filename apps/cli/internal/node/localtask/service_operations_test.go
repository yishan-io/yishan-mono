package localtask

import (
	"context"
	"errors"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_GetReturnsTaskAndNotFound(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Get task")
	gotValue, err := service.Get(context.Background(), rpc.LocalTaskIDParams{ID: "  " + task.ID + "  "})
	if err != nil || gotValue.(domain.Task).ID != task.ID {
		t.Fatalf("Get = %#v, %v", gotValue, err)
	}
	_, err = service.Get(context.Background(), rpc.LocalTaskIDParams{ID: "missing"})
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("Get missing error = %v", err)
	}
}

func TestService_ListFiltersAndRejectsInvalidStatus(t *testing.T) {
	service, _, repository := newTestService(t)
	createServiceTask(t, repository, "List task")
	status := domain.StatusActive
	listedValue, err := service.List(context.Background(), rpc.LocalTaskListParams{Status: &status})
	if err != nil || len(listedValue.([]domain.Task)) != 1 {
		t.Fatalf("List = %#v, %v", listedValue, err)
	}
	invalid := domain.Status("unknown")
	_, err = service.List(context.Background(), rpc.LocalTaskListParams{Status: &invalid})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("List invalid status error = %v", err)
	}
}

func TestService_UpdateReturnsNotFoundAndRejectsInvalidUpdate(t *testing.T) {
	service, _, _ := newTestService(t)
	title := "Updated"
	_, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: "missing", Title: &title})
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("Update missing error = %v", err)
	}
	emptyTitle := "  "
	_, err = service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: "task", Title: &emptyTitle})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("Update invalid error = %v", err)
	}
}

func TestService_SearchReturnsMatchesAndRejectsBlankQuery(t *testing.T) {
	service, _, repository := newTestService(t)
	task := createServiceTask(t, repository, "Searchable task")
	resultsValue, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{Query: "Searchable"})
	if err != nil || len(resultsValue.([]domain.SearchResult)) != 1 {
		t.Fatalf("Search = %#v, %v", resultsValue, err)
	}
	if resultsValue.([]domain.SearchResult)[0].ID != task.ID {
		t.Fatalf("Search result = %#v", resultsValue)
	}
	_, err = service.Search(context.Background(), rpc.LocalTaskSearchParams{Query: "  "})
	if !errors.Is(err, domain.ErrInvalidTask) {
		t.Fatalf("Search blank error = %v", err)
	}
}

func TestService_LinkWorkspaceRejectsMissingTaskAndInvalidRole(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	_, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: "missing", WorkspaceID: "workspace-1",
	})
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("LinkWorkspace missing task error = %v", err)
	}
	task := createServiceTask(t, repository, "Link task")
	_, err = service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: task.ID, WorkspaceID: "workspace-1", Role: "owner",
	})
	if !errors.Is(err, domain.ErrInvalidLink) {
		t.Fatalf("LinkWorkspace invalid role error = %v", err)
	}
}

func TestService_UnlinkWorkspacePreservesHistoryAndReturnsNotFound(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	task := createServiceTask(t, repository, "Unlink task")
	linkedValue, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: task.ID, WorkspaceID: "workspace-1",
	})
	if err != nil {
		t.Fatalf("LinkWorkspace: %v", err)
	}
	linkID := linkedValue.(domain.WorkspaceLink).ID
	if _, err := service.UnlinkWorkspace(context.Background(), rpc.LocalTaskLinkIDParams{LinkID: linkID}); err != nil {
		t.Fatalf("UnlinkWorkspace: %v", err)
	}
	history, err := repository.ListTaskLinks(context.Background(), task.ID)
	if err != nil || len(history) != 1 || history[0].Status != domain.StatusCompleted || history[0].UnlinkedAt == nil {
		t.Fatalf("unlinked history = %#v, %v", history, err)
	}
	_, err = service.UnlinkWorkspace(context.Background(), rpc.LocalTaskLinkIDParams{LinkID: "missing"})
	if !errors.Is(err, domain.ErrLinkNotFound) {
		t.Fatalf("UnlinkWorkspace missing error = %v", err)
	}
}

func TestService_UpdateWorkspaceLinkStatusValidatesAndPreservesHistory(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	task := createServiceTask(t, repository, "Link lifecycle")
	linkedValue, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: task.ID, WorkspaceID: "workspace-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	linkID := linkedValue.(domain.WorkspaceLink).ID
	pausedValue, err := service.UpdateWorkspaceLinkStatus(context.Background(), rpc.LocalTaskUpdateLinkStatusParams{
		LinkID: linkID, Status: domain.StatusPaused,
	})
	if err != nil || pausedValue.(domain.WorkspaceLink).Status != domain.StatusPaused {
		t.Fatalf("UpdateWorkspaceLinkStatus = %#v, %v", pausedValue, err)
	}
	_, err = service.UpdateWorkspaceLinkStatus(context.Background(), rpc.LocalTaskUpdateLinkStatusParams{
		LinkID: linkID, Status: domain.Status("invalid"),
	})
	if !errors.Is(err, domain.ErrInvalidLink) {
		t.Fatalf("invalid status error = %v", err)
	}
	_, err = service.UpdateWorkspaceLinkStatus(context.Background(), rpc.LocalTaskUpdateLinkStatusParams{
		LinkID: "missing", Status: domain.StatusCompleted,
	})
	if !errors.Is(err, domain.ErrLinkNotFound) {
		t.Fatalf("missing link error = %v", err)
	}
}

func TestService_SetPrimaryCreatesPrimaryAndRejectsMissingWorkspace(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	task := createServiceTask(t, repository, "Primary task")
	_, err := service.SetPrimary(context.Background(), rpc.LocalTaskSetPrimaryParams{
		TaskID: task.ID, WorkspaceID: "missing",
	})
	assertWorkspaceNotFound(t, err)
	createWorkspace(t, workspaceStore, "workspace-1")
	primaryValue, err := service.SetPrimary(context.Background(), rpc.LocalTaskSetPrimaryParams{
		TaskID: task.ID, WorkspaceID: "workspace-1",
	})
	if err != nil || primaryValue.(domain.WorkspaceLink).Role != domain.LinkRolePrimary {
		t.Fatalf("SetPrimary = %#v, %v", primaryValue, err)
	}
}

func TestService_ListWorkspaceLinksReturnsHistoryAndNotFound(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	task := createServiceTask(t, repository, "Workspace history")
	linkServiceTask(t, service, task.ID, "workspace-1")
	linksValue, err := service.ListWorkspaceLinks(context.Background(), rpc.LocalTaskWorkspaceIDParams{WorkspaceID: "workspace-1"})
	if err != nil || len(linksValue.([]domain.WorkspaceLink)) != 1 {
		t.Fatalf("ListWorkspaceLinks = %#v, %v", linksValue, err)
	}
	_, err = service.ListWorkspaceLinks(context.Background(), rpc.LocalTaskWorkspaceIDParams{WorkspaceID: "missing"})
	assertWorkspaceNotFound(t, err)
}

func TestService_ListTaskLinksReturnsHistoryAndTaskNotFound(t *testing.T) {
	service, workspaceStore, repository := newTestService(t)
	createWorkspace(t, workspaceStore, "workspace-1")
	task := createServiceTask(t, repository, "Task history")
	linkServiceTask(t, service, task.ID, "workspace-1")
	linksValue, err := service.ListTaskLinks(context.Background(), rpc.LocalTaskIDParams{ID: task.ID})
	if err != nil || len(linksValue.([]domain.WorkspaceLink)) != 1 {
		t.Fatalf("ListTaskLinks = %#v, %v", linksValue, err)
	}
	_, err = service.ListTaskLinks(context.Background(), rpc.LocalTaskIDParams{ID: "missing"})
	if !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("ListTaskLinks missing error = %v", err)
	}
}

func linkServiceTask(t *testing.T, service *Service, taskID string, workspaceID string) {
	t.Helper()
	_, err := service.LinkWorkspace(context.Background(), rpc.LocalTaskLinkWorkspaceParams{
		TaskID: taskID, WorkspaceID: workspaceID,
	})
	if err != nil {
		t.Fatalf("LinkWorkspace: %v", err)
	}
}

func assertWorkspaceNotFound(t *testing.T, err error) {
	t.Helper()
	var workspaceErr *workspace.Error
	if !errors.As(err, &workspaceErr) || workspaceErr.Code != workspace.ErrCodeNotFound {
		t.Fatalf("error = %v, want workspace not found", err)
	}
}
