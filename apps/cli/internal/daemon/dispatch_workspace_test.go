package daemon

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/config"
	cliruntime "yishan/apps/cli/internal/runtime"
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
func TestPublishWorkspaceSnapshotChanged_PublishesLocalInvalidationEvent(t *testing.T) {
	h := newTestHandler(t)
	subscriptionID, events := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	h.publishWorkspaceSnapshotChanged("org-1", "project-1", "workspace-1", "updated")

	select {
	case event := <-events:
		if event.Topic != "workspaceSnapshotChanged" {
			t.Fatalf("event topic = %q, want %q", event.Topic, "workspaceSnapshotChanged")
		}
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			t.Fatalf("event payload type = %T, want map[string]any", event.Payload)
		}
		if payload["organizationId"] != "org-1" || payload["projectId"] != "project-1" || payload["workspaceId"] != "workspace-1" || payload["change"] != "updated" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for workspace snapshot changed event")
	}
}

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

func TestHandleWorkspaceCreate_PublishesCreateStartedEvent(t *testing.T) {
	handler := newTestHandler(t)
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

	root := t.TempDir()
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

	result, err := handler.handleWorkspaceCreate(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceCreate returned unexpected error: %v", err)
	}
	resultMap, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}

	event := <-events
	if event.Topic != "workspaceCreateStarted" {
		t.Fatalf("expected first event topic %q, got %q", "workspaceCreateStarted", event.Topic)
	}
	payload, ok := event.Payload.(workspaceCreateStartedEvent)
	if !ok {
		t.Fatalf("expected workspaceCreateStarted payload, got %T", event.Payload)
	}
	if payload.WorkspaceID != resultMap["id"] {
		t.Fatalf("expected workspace id %v, got %s", resultMap["id"], payload.WorkspaceID)
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

// TestUpdatePreparedWorkspace_SnapshotFiredOnSuccess verifies that
// updatePreparedWorkspace fires workspaceSnapshotChanged when the API PATCH
// succeeds (runtime == nil short-circuits the HTTP call, returning no error).
func TestUpdatePreparedWorkspace_SnapshotFiredOnSuccess(t *testing.T) {
	h := newTestHandler(t)
	subID, events := h.events.Subscribe()
	defer h.events.Unsubscribe(subID)

	prepared := preparedWorkspaceCreate{
		workspaceID:    "ws-snap-1",
		organizationID: "org-1",
		projectID:      "proj-1",
		registration: &WorkspaceCreation{
			ID:             "ws-snap-1",
			OrganizationID: "org-1",
			ProjectID:      "proj-1",
		},
	}

	// runtime == nil → updateWorkspace returns nil (no HTTP call) → snapshot fires.
	warning := h.updatePreparedWorkspace(context.Background(), prepared, "/some/path")
	if warning != "" {
		t.Fatalf("expected empty warning with nil runtime, got %q", warning)
	}

	select {
	case event := <-events:
		if event.Topic != "workspaceSnapshotChanged" {
			t.Fatalf("expected workspaceSnapshotChanged, got %q", event.Topic)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for workspaceSnapshotChanged event")
	}
}

// TestUpdatePreparedWorkspace_SnapshotNotFiredOnAPIError verifies that
// updatePreparedWorkspace does NOT fire workspaceSnapshotChanged when the
// API PATCH fails — the outer executeWorktreeWorkspaceCreate is responsible
// for firing the fallback snapshot in that case.
func TestUpdatePreparedWorkspace_SnapshotNotFiredOnAPIError(t *testing.T) {
	// Wire a runtime with an unreachable API URL so the PATCH will fail.
	rt := cliruntime.New(&config.Config{
		API: config.APIConfig{
			BaseURL: "http://127.0.0.1:1", // port 1 is always refused
			Token:   "test-token",
		},
	})

	root := t.TempDir()
	statePath := filepath.Join(root, "daemon.state.json")
	indexStore, err := newWorkspaceIndexStore(statePath)
	if err != nil {
		t.Fatalf("newWorkspaceIndexStore: %v", err)
	}
	h := NewJSONRPCHandler(workspace.NewManager(), rt, "node-1", "", nil, indexStore, "", NewAppContextStore(""))
	t.Cleanup(func() { h.Shutdown() })

	subID, events := h.events.Subscribe()
	defer h.events.Unsubscribe(subID)

	prepared := preparedWorkspaceCreate{
		workspaceID:    "ws-snap-2",
		organizationID: "org-1",
		projectID:      "proj-1",
		registration: &WorkspaceCreation{
			ID:             "ws-snap-2",
			OrganizationID: "org-1",
			ProjectID:      "proj-1",
		},
	}

	warning := h.updatePreparedWorkspace(context.Background(), prepared, "/some/path")
	if warning == "" {
		t.Fatal("expected non-empty warning when API PATCH fails")
	}

	// The snapshot must NOT arrive from updatePreparedWorkspace itself —
	// the outer executeWorktreeWorkspaceCreate fires it via the fallback guard.
	select {
	case event := <-events:
		t.Fatalf("unexpected event from updatePreparedWorkspace on error: topic=%q", event.Topic)
	case <-time.After(100 * time.Millisecond):
		// correct: no event fired from within updatePreparedWorkspace
	}
}
