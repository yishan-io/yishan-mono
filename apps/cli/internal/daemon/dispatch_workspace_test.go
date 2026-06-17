package daemon

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

// TestHandleWorkspaceCreate_ReturnsPendingWithoutAPICall verifies that
// handleWorkspaceCreate returns a pending response immediately without making
// any pre-creation API call. With runtime == nil, any attempt to call
// registerWorkspace before the goroutine would cause a nil-pointer panic; the
// absence of a panic confirms the pre-creation registration block was removed.
func TestHandleWorkspaceCreate_ReturnsPendingWithoutAPICall(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}

	// runtime is nil — any pre-creation registerWorkspace call would panic.
	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(
		manager,
		nil, // runtime: nil; pre-creation API call would panic here
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		indexStore,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()

	params, err := json.Marshal(map[string]any{
		"organizationId": "org-1",
		"projectId":      "project-1",
		"repoKey":        "owner/repo",
		"workspaceName":  "feature-test",
		"sourcePath":     root,
		"targetBranch":   "feature-test",
		"sourceBranch":   "main",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.handleWorkspaceCreate(context.Background(), params)
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
