package daemon

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

// newTestHandler creates a JSONRPCHandler wired to a temp-dir workspace index
// for use in dispatch handler unit tests.
func newTestHandler(t *testing.T) *JSONRPCHandler {
	t.Helper()
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}
	manager := workspace.NewManager()
	h := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		indexStore,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	t.Cleanup(func() { h.Shutdown() })
	return h
}

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
	if record["worktreePath"] == "" || record["worktreePath"] == nil {
		t.Errorf("expected non-empty worktreePath in result")
	}
}

func TestHandleWorkspaceCreate_PreservesProvidedID(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		indexStore,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()

	params, err := json.Marshal(map[string]any{
		"id":             "workspace-fixed-id",
		"organizationId": "org-1",
		"projectId":      "project-1",
		"repoKey":        "owner/repo",
		"workspaceName":  "feature/mobile",
		"sourcePath":     root,
		"targetBranch":   "feature/mobile",
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
	if got := record["id"]; got != "workspace-fixed-id" {
		t.Fatalf("expected provided workspace id to be preserved, got %v", got)
	}
	if got := record["worktreePath"]; got == nil || got == "" {
		t.Fatal("expected worktreePath to be returned")
	}
}

func TestHandleWorkspaceOpen_RegistersWorkspace(t *testing.T) {
	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}

	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		indexStore,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()

	params, err := json.Marshal(map[string]any{
		"id":        "workspace-open-1",
		"path":      root,
		"projectId": "project-1",
		"orgId":     "org-1",
	})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}

	result, err := handler.dispatchWorkspace(context.Background(), nil, MethodWorkspaceOpen, params)
	if err != nil {
		t.Fatalf("%s returned unexpected error: %v", MethodWorkspaceOpen, err)
	}

	record, ok := result.(workspace.Workspace)
	if !ok {
		t.Fatalf("expected workspace result for %s, got %T", MethodWorkspaceOpen, result)
	}
	if record.ID != "workspace-open-1" {
		t.Fatalf("expected workspace id to be registered for %s, got %q", MethodWorkspaceOpen, record.ID)
	}
}

// TestHandleWorkspaceOpenProject_Success verifies that a valid, previously
// unknown workspace is opened, indexed, and returned in the opened list.
func TestHandleWorkspaceOpenProject_Success(t *testing.T) {
	dir := t.TempDir()
	h := newTestHandler(t)

	params, err := json.Marshal(workspaceOpenProjectParams{
		Workspaces: []workspaceOpenProjectEntry{
			{WorkspaceID: "ws-1", WorktreePath: dir, ProjectID: "proj-1", OrgID: "org-1"},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := h.handleWorkspaceOpenProject(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result, ok := raw.(workspaceOpenProjectResult)
	if !ok {
		t.Fatalf("unexpected result type %T", raw)
	}
	if len(result.Opened) != 1 || result.Opened[0] != "ws-1" {
		t.Errorf("expected opened=[ws-1], got %v", result.Opened)
	}
	if len(result.Skipped) != 0 {
		t.Errorf("expected no skipped, got %v", result.Skipped)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}

	// Workspace must be in manager now.
	if _, err := h.manager.GetWorkspace("ws-1"); err != nil {
		t.Errorf("workspace ws-1 should be in manager after openProject: %v", err)
	}

	// Workspace must be persisted to the index store.
	entries, err := h.wsIndexStore.List()
	if err != nil {
		t.Fatalf("index List: %v", err)
	}
	found := false
	for _, e := range entries {
		if e.WorkspaceID == "ws-1" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("ws-1 was not written to workspace-index.json")
	}
}

// TestHandleWorkspaceOpenProject_Idempotent verifies that calling openProject
// for a workspace already in the manager skips it without error.
func TestHandleWorkspaceOpenProject_Idempotent(t *testing.T) {
	dir := t.TempDir()
	h := newTestHandler(t)

	// Pre-open the workspace directly in the manager.
	if _, err := h.manager.Open(workspace.OpenRequest{ID: "ws-2", Path: dir}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(workspaceOpenProjectParams{
		Workspaces: []workspaceOpenProjectEntry{
			{WorkspaceID: "ws-2", WorktreePath: dir},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := h.handleWorkspaceOpenProject(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(workspaceOpenProjectResult)
	if len(result.Opened) != 0 {
		t.Errorf("expected no opened, got %v", result.Opened)
	}
	if len(result.Skipped) != 1 || result.Skipped[0] != "ws-2" {
		t.Errorf("expected skipped=[ws-2], got %v", result.Skipped)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
}

// TestHandleWorkspaceOpenProject_MissingFields verifies that entries with
// empty workspaceId or worktreePath produce error entries, not panics.
func TestHandleWorkspaceOpenProject_MissingFields(t *testing.T) {
	h := newTestHandler(t)

	params, err := json.Marshal(workspaceOpenProjectParams{
		Workspaces: []workspaceOpenProjectEntry{
			{WorkspaceID: "", WorktreePath: ""},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := h.handleWorkspaceOpenProject(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(workspaceOpenProjectResult)
	if len(result.Errors) != 1 {
		t.Errorf("expected 1 error entry, got %v", result.Errors)
	}
	if len(result.Opened) != 0 {
		t.Errorf("expected no opened entries, got %v", result.Opened)
	}
}

// TestHandleWorkspaceCloseProject verifies that the handler stops terminals
// for each listed workspace ID and returns the stopped list.
func TestHandleWorkspaceCloseProject(t *testing.T) {
	h := newTestHandler(t)

	params, err := json.Marshal(workspaceCloseProjectParams{
		WorkspaceIDs: []string{"ws-a", "ws-b", ""},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := h.handleWorkspaceCloseProject(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceCloseProject: %v", err)
	}

	result := raw.(workspaceCloseProjectResult)
	// Empty string entry must be filtered out.
	if len(result.Stopped) != 2 {
		t.Errorf("expected 2 stopped entries (empty string filtered), got %v", result.Stopped)
	}
	if result.Stopped[0] != "ws-a" || result.Stopped[1] != "ws-b" {
		t.Errorf("unexpected stopped order: %v", result.Stopped)
	}
}
