package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

func TestWorkspaceCreate_ReturnsPendingWhenAPIRegistrationIsSkipped(t *testing.T) {
	root := t.TempDir()
	handler := newTestService(t, nil, "node-1")

	params, err := json.Marshal(map[string]any{
		"repoKey":       "owner/repo",
		"workspaceName": "feature-test",
		"sourcePath":    root,
		"targetBranch":  "feature-test",
		"sourceBranch":  "main",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, params)
	if err != nil {
		t.Fatalf("handleWorkspaceCreate returned unexpected error: %v", err)
	}

	record, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if record["status"] != "pending" {
		t.Errorf("expected status %q, got %q", "pending", record["status"])
	}
	if record["id"] == "" || record["id"] == nil {
		t.Errorf("expected non-empty workspace id in result")
	}
}

func TestWorkspaceCreate_UsesAuthoritativeAPIWorkspaceID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/orgs/org-1/projects/project-1/workspaces" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"workspace":{"id":"ws-api-1","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"provisioning","branch":"feature-test","sourceBranch":"main","localPath":"","createdAt":"2026-06-30T00:00:00.000Z","updatedAt":"2026-06-30T00:00:00.000Z"}}`))
	}))
	defer server.Close()

	root := t.TempDir()
	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := newTestService(t, runtime, "node-1")
	subscriptionID, events := handler.deps.Events.Subscribe()
	defer handler.deps.Events.Unsubscribe(subscriptionID)

	params, err := json.Marshal(map[string]any{
		"organizationId": "org-1",
		"projectId":      "project-1",
		"repoKey":        "owner/repo",
		"workspaceName":  "feature-test",
		"sourcePath":     root,
		"targetBranch":   "feature-test",
		"sourceBranch":   "main",
		"nodeId":         "node-1",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, params)
	if err != nil {
		t.Fatalf("handleWorkspaceCreate returned unexpected error: %v", err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	workspaceID, ok := resultMap["id"].(string)
	if !ok || workspaceID == "" {
		t.Fatalf("expected a locally generated workspace id, got %v", resultMap["id"])
	}

	snapshotEvent := <-events
	if snapshotEvent.Topic != "workspaceSnapshotChanged" {
		t.Fatalf("expected first event topic %q, got %q", "workspaceSnapshotChanged", snapshotEvent.Topic)
	}
	startedEvent := <-events
	if startedEvent.Topic != "workspaceCreateStarted" {
		t.Fatalf("expected second event topic %q, got %q", "workspaceCreateStarted", startedEvent.Topic)
	}
	payload, ok := startedEvent.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("expected workspaceCreateStarted payload, got %T", startedEvent.Payload)
	}
	if payload.WorkspaceID != workspaceID {
		t.Fatalf("expected workspace id %q, got %s", workspaceID, payload.WorkspaceID)
	}
	if payload.OrganizationID != "org-1" || payload.ProjectID != "project-1" {
		t.Fatalf("unexpected payload org/project: %+v", payload)
	}
	if payload.WorkspaceName != "feature-test" || payload.SourceBranch != "main" || payload.Branch != "feature-test" {
		t.Fatalf("unexpected payload branches: %+v", payload)
	}
	if payload.NodeID != "node-1" {
		t.Fatalf("expected node-1, got %s", payload.NodeID)
	}
}

type tokenUsageRecoveryProbe struct {
	recoverySinceByAgent map[string]int64
	needsRerun           map[string]bool
	inFlight             map[string]bool
}
