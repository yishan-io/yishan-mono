package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"

	"yishan/apps/cli/internal/adapter/sqlite"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/rpc"
)

func TestBuildNamespaceRouter_RoutesLocalTaskMethods(t *testing.T) {
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", Kind: "folder", Status: "active", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	localTaskService := nodelocaltask.NewService(nodelocaltask.Deps{
		Repository: sqlite.NewLocalTaskStore(database), WorkspaceStore: sqlite.NewStore(workspaceStore),
	})
	router := buildNamespaceRouter(nil, nil, nil, nil, nil, localTaskService)

	createdValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskCreate, json.RawMessage(`{"id":"../../caller-id","title":"Routed"}`))
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	created := createdValue.(domain.Task)
	if created.Title != "Routed" || created.ID == "../../caller-id" {
		t.Fatalf("created task = %#v", created)
	}
	if _, err := uuid.Parse(created.ID); err != nil {
		t.Fatalf("generated task ID %q is not a UUID: %v", created.ID, err)
	}
	if created.Tags == nil {
		t.Fatalf("created tags = nil, want non-nil empty array")
	}
	tagsValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskListTags, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("list tags: %v", err)
	}
	tags := tagsValue.([]string)
	if tags == nil || len(tags) != 0 {
		t.Fatalf("list tags = %#v, want non-nil empty array", tags)
	}
	encodedTags, err := json.Marshal(tags)
	if err != nil || string(encodedTags) != `[]` {
		t.Fatalf("list tags JSON = %s, %v; want []", encodedTags, err)
	}
	if _, err := sqlite.NewLocalTaskStore(database).Get(context.Background(), "../../caller-id"); !errors.Is(err, domain.ErrTaskNotFound) {
		t.Fatalf("caller task ID lookup error = %v, want task not found", err)
	}
	contextValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskGetContextDetails,
		json.RawMessage(`{"id":"`+created.ID+`"}`))
	if err != nil {
		t.Fatalf("get context details: %v", err)
	}
	details := contextValue.(domain.ContextDetails)
	if details.Directory == "" || details.PlanPath == "" || details.NotesPath == "" || details.OutcomePath == "" {
		t.Fatalf("context details = %#v", details)
	}
	linkedValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskLinkWorkspace,
		json.RawMessage(`{"taskId":"`+created.ID+`","workspaceId":"workspace-1"}`))
	if err != nil {
		t.Fatalf("link workspace: %v", err)
	}
	link := linkedValue.(domain.WorkspaceLink)
	_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdateWorkspaceLinkStatus,
		json.RawMessage(`{"linkId":"`+link.ID+`","status":"invalid"}`))
	if mapped := rpc.MapRPCError(err); mapped == nil || mapped.Code != rpc.CodeInvalidParams {
		t.Fatalf("update invalid link status error = %v, mapped = %#v", err, mapped)
	}
	if _, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUnlinkWorkspace,
		json.RawMessage(`{"linkId":"`+link.ID+`"}`)); err != nil {
		t.Fatalf("unlink workspace: %v", err)
	}
	for _, status := range []domain.Status{domain.StatusPaused, domain.StatusCompleted} {
		_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdateWorkspaceLinkStatus,
			json.RawMessage(`{"linkId":"`+link.ID+`","status":"`+string(status)+`"}`))
		if mapped := rpc.MapRPCError(err); mapped == nil || mapped.Code != rpc.CodeInvalidParams {
			t.Fatalf("update unlinked link to %q error = %v, mapped = %#v", status, err, mapped)
		}
	}
	history, err := sqlite.NewLocalTaskStore(database).ListTaskLinks(context.Background(), created.ID)
	if err != nil || len(history) != 1 || history[0].Status != domain.StatusCompleted || history[0].UnlinkedAt == nil {
		t.Fatalf("unlinked repository history = %#v, %v", history, err)
	}
}
