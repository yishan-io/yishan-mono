package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/agent/dsh"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/workspace"
)

func TestDSHTaskCapabilityMetadataAndDocuments(t *testing.T) {
	service, scope := newDSHTaskTestService(t)
	created, err := executeDSHTaskStart(context.Background(), service, scope, taskRequest(dshTaskStartOperation, map[string]any{
		"title": "Build task package", "description": "Description", "tags": []string{"dsh"},
	}))
	if err != nil {
		t.Fatal(err)
	}
	if created.ProjectID == nil || *created.ProjectID != scope.workspace.ProjectID || created.OrganizationID == nil || *created.OrganizationID != scope.workspace.OrgID {
		t.Fatalf("created task scope = %#v", created)
	}

	if _, err := executeDSHTaskWrite(context.Background(), service, scope, taskRequest(dshTaskWriteOperation, map[string]any{
		"id": created.ID, "document": "plan", "content": "Implementation plan",
	})); err != nil {
		t.Fatal(err)
	}
	read, err := executeDSHTaskRead(context.Background(), service, scope, taskRequest(dshTaskReadOperation, map[string]any{
		"id": created.ID, "document": "plan",
	}))
	if err != nil || read.(dshTaskDocumentReadResult).Content != "Implementation plan" {
		t.Fatalf("read=%#v err=%v", read, err)
	}
	finished, err := executeDSHTaskFinish(context.Background(), service, scope, taskRequest(dshTaskFinishOperation, map[string]any{
		"id": created.ID, "outcome": "Complete",
	}))
	if err != nil || finished.Status != domain.StatusDone {
		t.Fatalf("finished=%#v err=%v", finished, err)
	}
}

func newDSHTaskTestService(t *testing.T) (*nodelocaltask.Service, dshTaskScope) {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{ID: "workspace-1", Kind: "folder", Status: "active", State: "active", LocalPath: root, ProjectID: "project-1", OrganizationID: "org-1"}); err != nil {
		t.Fatal(err)
	}
	service := nodelocaltask.NewService(nodelocaltask.Deps{
		Repository: sqlite.NewLocalTaskStore(database), WorkspaceStore: sqlite.NewStore(workspaceStore),
	})
	scope := dshTaskScope{workspace: workspace.Workspace{ID: "workspace-1", Path: root, ProjectID: "project-1", OrgID: "org-1"}}
	return service, scope
}

func taskRequest(operation string, input map[string]any) dsh.CapabilityRequest {
	payload, err := json.Marshal(input)
	if err != nil {
		panic(err)
	}
	return dsh.CapabilityRequest{Operation: operation, Input: payload}
}
