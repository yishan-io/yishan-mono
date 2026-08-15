package daemon

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/config"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

// TestHandleWorkspaceCreate_RejectsInvalidTaskRunBeforePublishingStart verifies
// that input validation runs before any event is published (the handler calls
// Service.Create, which prepares before emitting created events).
func TestHandleWorkspaceCreate_RejectsInvalidTaskRunBeforePublishingStart(t *testing.T) {
	handler := newWorkspaceCreateFlowTestHandler(t, "http://unused")
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

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

	_, err = handler.handleWorkspaceCreate(context.Background(), params)
	if err == nil || !strings.Contains(err.Error(), "unsupported task-run agent kind") {
		t.Fatalf("err = %v, want unsupported task-run agent kind", err)
	}
	expectNoEvent(t, events, 100*time.Millisecond)
}

func newWorkspaceCreateFlowTestHandler(t *testing.T, baseURL string) *JSONRPCHandler {
	t.Helper()
	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: baseURL, Token: "test-token"}})
	handler := NewJSONRPCHandler(workspace.NewManager(), runtime, "node-local", filepath.Join(t.TempDir(), "daemon.log"), nil, filepath.Join(t.TempDir(), "config.yml"), NewAppContextStore(""))
	t.Cleanup(func() { handler.Shutdown() })
	return handler
}
