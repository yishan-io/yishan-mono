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
	_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdate,
		json.RawMessage(`{"id":"`+created.ID+`","tags":["First"]}`))
	if err != nil {
		t.Fatalf("add tag: %v", err)
	}
	catalogValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskListTagCatalog, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("list tag catalog: %v", err)
	}
	catalog := catalogValue.([]domain.Tag)
	if len(catalog) != 1 || catalog[0].Key != "first" || catalog[0].Color != nil {
		t.Fatalf("tag catalog = %#v", catalog)
	}
	updatedTagValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdateTagColor,
		json.RawMessage(`{"id":"`+catalog[0].ID+`","color":"blue"}`))
	if err != nil {
		t.Fatalf("update tag color: %v", err)
	}
	updatedTag := updatedTagValue.(domain.Tag)
	if updatedTag.Color == nil || *updatedTag.Color != domain.TagColorBlue {
		t.Fatalf("updated tag = %#v", updatedTag)
	}
	for _, params := range []json.RawMessage{
		json.RawMessage(`{"id":"` + catalog[0].ID + `"}`),
		json.RawMessage(`{"id":"` + catalog[0].ID + `","color":1}`),
		json.RawMessage(`{"id":"` + catalog[0].ID + `","color":false}`),
	} {
		_, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdateTagColor, params)
		if err == nil {
			t.Fatalf("invalid tag color params %s succeeded", params)
		}
		if mapped := rpc.MapRPCError(err); mapped == nil || mapped.Code != rpc.CodeInvalidParams {
			t.Fatalf("invalid tag color params %s error = %v, mapped = %#v", params, err, mapped)
		}
	}
	clearedTagValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskUpdateTagColor,
		json.RawMessage(`{"id":"`+catalog[0].ID+`","color":null}`))
	if err != nil {
		t.Fatalf("clear tag color: %v", err)
	}
	if clearedTag := clearedTagValue.(domain.Tag); clearedTag.Color != nil {
		t.Fatalf("cleared tag = %#v", clearedTag)
	}
	catalogValue, err = router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskListTagCatalog, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("list cleared tag catalog: %v", err)
	}
	if catalog = catalogValue.([]domain.Tag); len(catalog) != 1 || catalog[0].Color != nil {
		t.Fatalf("cleared tag catalog = %#v", catalog)
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
	createdTagValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskCreateTag,
		json.RawMessage(`{"name":"Second"}`))
	if err != nil {
		t.Fatalf("create stable tag: %v", err)
	}
	createdTag := createdTagValue.(domain.Tag)
	renamedTagValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskRenameTag,
		json.RawMessage(`{"id":"`+createdTag.ID+`","name":"First"}`))
	if err != nil {
		t.Fatalf("merge stable tags: %v", err)
	}
	renamedTag := renamedTagValue.(rpc.LocalTaskRenameTagResult)
	if renamedTag.Tag.ID != catalog[0].ID || renamedTag.RemovedTagID == nil || *renamedTag.RemovedTagID != createdTag.ID {
		t.Fatalf("merge response = %#v", renamedTag)
	}
	for _, staleMutation := range []struct {
		method string
		params json.RawMessage
	}{
		{rpc.MethodLocalTaskRenameTag, json.RawMessage(`{"id":"` + createdTag.ID + `","name":"Renamed"}`)},
		{rpc.MethodLocalTaskUpdateTagColor, json.RawMessage(`{"id":"` + createdTag.ID + `","color":"blue"}`)},
		{rpc.MethodLocalTaskDeleteTag, json.RawMessage(`{"id":"` + createdTag.ID + `"}`)},
	} {
		if _, err := router.Call(context.Background(), &rpc.Connection{}, staleMutation.method, staleMutation.params); err == nil || rpc.MapRPCError(err).Code != rpc.CodeNotFound {
			t.Fatalf("%s stale tag ID error = %v", staleMutation.method, err)
		}
	}
	deletedTagValue, err := router.Call(context.Background(), &rpc.Connection{}, rpc.MethodLocalTaskDeleteTag,
		json.RawMessage(`{"id":"`+catalog[0].ID+`"}`))
	if err != nil || deletedTagValue.(rpc.LocalTaskDeleteTagResult).DeletedTagID != catalog[0].ID {
		t.Fatalf("delete stable tag response = %#v, %v", deletedTagValue, err)
	}
	history, err := sqlite.NewLocalTaskStore(database).ListTaskLinks(context.Background(), created.ID)
	if err != nil || len(history) != 1 || history[0].Status != domain.StatusCompleted || history[0].UnlinkedAt == nil {
		t.Fatalf("unlinked repository history = %#v, %v", history, err)
	}
}
