package workspace

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

// TestHandleWorkspaceCreate_RejectsInvalidTaskRunBeforePublishingStart verifies
// that input validation runs before any event is published (the handler calls
// Service.Create, which prepares before emitting created events).
func TestWorkspaceCreate_RejectsInvalidTaskRunBeforePublishingStart(t *testing.T) {
	handler := newWorkspaceCreateFlowTestHandler(t, "http://unused")
	subscriptionID, events := handler.deps.Events.Subscribe()
	defer handler.deps.Events.Unsubscribe(subscriptionID)

	params, err := json.Marshal(workspaceCreateParams{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		SourcePath:     "/tmp/primary-repo",
		RepoKey:        "acme/repo",
		TargetBranch:   "feature/test",
		SourceBranch:   "main",
		TaskRun:        &workspace.TaskRunConfig{AgentKind: "builder"},
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	_, err = handler.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, params)
	if err == nil || !strings.Contains(err.Error(), "unsupported task-run agent kind") {
		t.Fatalf("err = %v, want unsupported task-run agent kind", err)
	}
	expectNoEvent(t, events, 100*time.Millisecond)
}

func newWorkspaceCreateFlowTestHandler(t *testing.T, baseURL string) *Service {
	t.Helper()
	runtime := session.New(&config.Config{API: config.APIConfig{BaseURL: baseURL, Token: "test-token"}})
	handler := newTestService(t, runtime, "node-local")
	return handler
}
