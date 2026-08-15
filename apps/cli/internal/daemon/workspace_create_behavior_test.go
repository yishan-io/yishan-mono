package daemon

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"
)

// ============================= create, local node =============================

func TestCreateLocalNode_EventSequence(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	manager := workspace.NewManager()
	h := newBehaviorHandler(t, manager, apiConfiguredRuntime(apiServer), "node-1", openMigratedTestDB(t))
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	worktreePath, err := workspace.DefaultWorktreePath("owner/repo", "feature-seq")
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(worktreePath) })

	raw, err := json.Marshal(map[string]any{
		"id": "ws-seq-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/repo", "workspaceName": "feature-seq", "sourcePath": sourceRepo,
		"targetBranch": "feature-seq", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}

	result, err := h.handleWorkspaceCreate(context.Background(), raw)
	if err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}
	pending, ok := result.(map[string]any)
	if !ok || pending["status"] != "pending" || pending["id"] != "ws-seq-1" {
		t.Fatalf("create result = %#v, want {id: ws-seq-1, status: pending}", result)
	}

	events := collectUntil(t, eventCh, "workspaceCreateCompleted", 30*time.Second)

	// Documented sequence (see file header): created → started → steps → updated → complete → completed.
	assertTopicSequence(t, events, []string{
		"workspaceSnapshotChanged", // change:"created"
		"workspaceCreateStarted",
		"workspaceCreateProgress",  // worktree running
		"workspaceCreateProgress",  // worktree completed
		"workspaceCreateProgress",  // context running
		"workspaceCreateProgress",  // context skipped
		"workspaceCreateProgress",  // setup running
		"workspaceCreateProgress",  // setup skipped
		"workspaceSnapshotChanged", // change:"updated" (finalize)
		"workspaceCreateProgress",  // complete completed
		"workspaceCreateCompleted",
	})

	started := decodeCreateStartedEvent(t, findTopic(events, "workspaceCreateStarted"))
	if started.WorkspaceID != "ws-seq-1" || started.NodeID != "node-1" {
		t.Fatalf("createStarted = %#v, want workspaceId ws-seq-1 nodeId node-1", started)
	}

	progress := decodeProgressEvents(t, events)
	if want := []string{
		"worktree:running", "worktree:completed",
		"context:running", "context:skipped",
		"setup:running", "setup:skipped",
		"complete:completed",
	}; !reflect.DeepEqual(progressStepSequence(progress), want) {
		t.Fatalf("progress steps = %v, want %v", progressStepSequence(progress), want)
	}

	completed := findTopic(events, "workspaceCreateCompleted")
	completedPayload, ok := completed.Payload.(map[string]any)
	if !ok || completedPayload["workspaceId"] != "ws-seq-1" {
		t.Fatalf("workspaceCreateCompleted payload = %#v, want workspaceId ws-seq-1", completed.Payload)
	}
	createdPath, _ := completedPayload["worktreePath"].(string)
	if createdPath == "" {
		t.Fatalf("workspaceCreateCompleted payload missing worktreePath: %#v", completed.Payload)
	}
	if _, statErr := os.Stat(createdPath); statErr != nil {
		t.Fatalf("worktree missing after create: %v", statErr)
	}

	// Cloud record changes: create (provisioning) then update (active).
	if recorder.count(http.MethodPost, "/projects/project-1/workspaces") != 1 {
		t.Fatalf("expected one API create call, got %v", recorder.snapshot())
	}
	if recorder.count(http.MethodPatch, "/workspaces/ws-seq-1") != 1 {
		t.Fatalf("expected one API update call, got %v", recorder.snapshot())
	}

	// Local record changes: SQLite row provisioning → active with localPath.
	store := localdb.NewWorkspaceStore(h.localDatabase)
	row, err := store.Get(context.Background(), "ws-seq-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "active" || row.LocalPath != createdPath || row.State != workspace.WorkspaceStateActive {
		t.Fatalf("persisted workspace = %#v, want status active state active localPath %q", row, createdPath)
	}

	// In-memory runtime record.
	ws, err := manager.GetWorkspace("ws-seq-1")
	if err != nil || ws.State != workspace.WorkspaceStateActive {
		t.Fatalf("manager workspace = %#v, err %v; want active", ws, err)
	}
}

// ============================= create, remote node =============================

func TestCreateRemoteNode_EventSequence(t *testing.T) {
	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)
	relayMessages := wireRelayCapture(t, h, map[string]any{"accepted": true})

	raw, err := json.Marshal(map[string]any{
		"id": "ws-remote-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-2",
		"branch": "feature-remote", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := h.handleWorkspaceCreate(context.Background(), raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	var relayMsg map[string]any
	select {
	case relayMsg = <-relayMessages:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for relay dispatch")
	}
	events := collectUntil(t, eventCh, "workspaceCreateStarted", 5*time.Second)

	envelope := decodeRelayCreateEnvelope(t, relayMsg)
	if envelope.Change != createflow.RelayChangeCreateRequest {
		t.Fatalf("relay change = %q, want %q", envelope.Change, createflow.RelayChangeCreateRequest)
	}
	if envelope.TargetNodeID != "node-2" || envelope.SourceNodeID != "node-1" {
		t.Fatalf("relay envelope = %#v, want target node-2 source node-1", envelope)
	}
	if envelope.Request == nil || envelope.Request.ID != "ws-remote-1" || envelope.Request.NodeID != "node-2" || envelope.Request.ReplyNodeID != "node-1" {
		t.Fatalf("relay request = %#v, want id ws-remote-1 node node-2 reply node-1", envelope.Request)
	}

	// Event sequence on the origin: created + started, nothing else.
	assertTopicSequence(t, events, []string{
		"workspaceSnapshotChanged", // change:"created"
		"workspaceCreateStarted",
	})
	started := decodeCreateStartedEvent(t, findTopic(events, "workspaceCreateStarted"))
	if started.NodeID != "node-2" {
		t.Fatalf("createStarted nodeId = %q, want node-2 (executor)", started.NodeID)
	}
	if extra := lifecycleTopicNames(collectFor(t, eventCh, 300*time.Millisecond)); len(extra) != 0 {
		t.Fatalf("unexpected events after relay dispatch: %v", extra)
	}

	// Cloud record written; no local SQLite row (origin skips it for relays).
	if recorder.count(http.MethodPost, "/projects/project-1/workspaces") != 1 {
		t.Fatalf("expected one API create call, got %v", recorder.snapshot())
	}
	if _, err := localdb.NewWorkspaceStore(database).Get(context.Background(), "ws-remote-1"); err == nil {
		t.Fatal("expected no local SQLite row for remote-target create")
	}
	if len(manager.List()) != 0 {
		t.Fatalf("expected no manager runtime records, got %v", manager.List())
	}
}

// ============================= create rollback =============================

// TestCreateLocalNode_WorktreeStepFailureRollsBack covers the earliest
// rollback: the worktree step fails (source dir is not a git repo), the local
// provisioning row and the cloud record must be closed, and a failed event is
// published.
func TestCreateLocalNode_WorktreeStepFailureRollsBack(t *testing.T) {
	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	nonGitSource := t.TempDir() // exists but is not a git repo → worktree step fails

	raw, err := json.Marshal(map[string]any{
		"id": "ws-fail-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/repo", "workspaceName": "feature-fail", "sourcePath": nonGitSource,
		"targetBranch": "feature-fail", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := h.handleWorkspaceCreate(context.Background(), raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	events := collectUntil(t, eventCh, "workspaceCreateFailed", 20*time.Second)

	assertTopicSequence(t, events, []string{
		"workspaceSnapshotChanged", // change:"created"
		"workspaceCreateStarted",
		"workspaceCreateProgress", // worktree running
		"workspaceCreateProgress", // worktree failed
		"workspaceCreateProgress", // complete failed
		"workspaceCreateFailed",
	})

	// Cloud record closed (registration rollback).
	statuses := recorder.closeStatuses()
	if len(statuses) == 0 || statuses[0] != "closed" {
		t.Fatalf("expected close with status closed, got %v", statuses)
	}
	if recorder.count(http.MethodPost, "/projects/project-1/workspaces") != 1 {
		t.Fatalf("expected one API create call, got %v", recorder.snapshot())
	}

	// Local row closed.
	row, err := localdb.NewWorkspaceStore(database).Get(context.Background(), "ws-fail-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "closed" {
		t.Fatalf("persisted status = %q, want closed", row.Status)
	}
	if len(manager.List()) != 0 {
		t.Fatalf("expected no manager runtime records after failed create, got %v", manager.List())
	}
}

// TestCreateLocalNode_ContextStepFailureRollsBackWorktree covers the rollback
// after a completed step: the worktree step succeeds, the context step fails
// (the context dir path is blocked by a regular file), and the partially
// created worktree must be cleaned up.
func TestCreateLocalNode_ContextStepFailureRollsBackWorktree(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	// Block the context dir path with a regular file so ensureContextLink's
	// MkdirAll fails deterministically. Cleaned up after the test.
	blockedContextPath, err := workspace.DefaultContextPath("owner/ctxfail")
	if err != nil {
		t.Fatalf("DefaultContextPath: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(blockedContextPath), 0o755); err != nil {
		t.Fatalf("mkdir context parent: %v", err)
	}
	if err := os.WriteFile(blockedContextPath, []byte("block"), 0o644); err != nil {
		t.Fatalf("write blocking context file: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(blockedContextPath) })

	worktreePath, err := workspace.DefaultWorktreePath("owner/ctxfail", "feature-ctxfail")
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(worktreePath) })

	raw, err := json.Marshal(map[string]any{
		"id": "ws-ctxfail", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/ctxfail", "workspaceName": "feature-ctxfail", "sourcePath": sourceRepo,
		"targetBranch": "feature-ctxfail", "sourceBranch": "main", "contextEnabled": true,
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := h.handleWorkspaceCreate(context.Background(), raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	events := collectUntil(t, eventCh, "workspaceCreateFailed", 30*time.Second)

	assertTopicSequence(t, events, []string{
		"workspaceSnapshotChanged", // change:"created"
		"workspaceCreateStarted",
		"workspaceCreateProgress", // worktree running
		"workspaceCreateProgress", // worktree completed
		"workspaceCreateProgress", // context running
		"workspaceCreateProgress", // context failed
		"workspaceCreateProgress", // complete failed
		"workspaceCreateFailed",
	})

	// The partially created worktree and its branch are removed on rollback.
	if _, statErr := os.Stat(worktreePath); !os.IsNotExist(statErr) {
		t.Fatalf("worktree still exists after failed create: %v", statErr)
	}

	statuses := recorder.closeStatuses()
	if len(statuses) == 0 || statuses[0] != "closed" {
		t.Fatalf("expected close with status closed, got %v", statuses)
	}
	row, err := localdb.NewWorkspaceStore(database).Get(context.Background(), "ws-ctxfail")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "closed" {
		t.Fatalf("persisted status = %q, want closed", row.Status)
	}
}

// TestCreateLocalNode_SetupHookWarningCompletes records that a failing setup
// hook is a WARNING, not a rollback: the create still completes and the
// worktree stays.
func TestCreateLocalNode_SetupHookWarningCompletes(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, nil, "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	worktreePath, err := workspace.DefaultWorktreePath("owner/warnrepo", "feature-warn")
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(worktreePath) })

	raw, err := json.Marshal(map[string]any{
		"id": "ws-warn", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/warnrepo", "workspaceName": "feature-warn", "sourcePath": sourceRepo,
		"targetBranch": "feature-warn", "sourceBranch": "main", "setupHook": "false",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := h.handleWorkspaceCreate(context.Background(), raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	events := collectUntil(t, eventCh, "workspaceCreateCompleted", 30*time.Second)

	progress := decodeProgressEvents(t, events)
	if want := []string{
		"worktree:running", "worktree:completed",
		"context:running", "context:skipped",
		"setup:running", "setup:warning",
		"complete:completed",
	}; !reflect.DeepEqual(progressStepSequence(progress), want) {
		t.Fatalf("progress steps = %v, want %v", progressStepSequence(progress), want)
	}
	if lifecycle := lifecycleTopicNames(events); containsString(lifecycle, "workspaceCreateFailed") {
		t.Fatalf("setup hook failure must not publish workspaceCreateFailed: %v", lifecycle)
	}
	if _, statErr := os.Stat(worktreePath); statErr != nil {
		t.Fatalf("worktree missing after warning create: %v", statErr)
	}
	row, err := localdb.NewWorkspaceStore(database).Get(context.Background(), "ws-warn")
	if err != nil || row.Status != "active" {
		t.Fatalf("persisted workspace = %#v, err %v; want status active", row, err)
	}
}

// TestCreateRemoteNode_DispatchRejectedRollsBackRegistration covers the remote
// dispatch failure: the relay rejects the target (offline), the origin must
// close the cloud provisioning record and publish the failed events.
func TestCreateRemoteNode_DispatchRejectedRollsBackRegistration(t *testing.T) {
	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)
	wireRelayCapture(t, h, map[string]any{"accepted": false, "reason": "target node offline"})

	raw, err := json.Marshal(map[string]any{
		"id": "ws-rejected", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-2",
		"branch": "feature-rejected", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := h.handleWorkspaceCreate(context.Background(), raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	events := collectUntil(t, eventCh, "workspaceCreateFailed", 10*time.Second)

	assertTopicSequence(t, events, []string{
		"workspaceSnapshotChanged", // change:"created"
		"workspaceCreateStarted",
		"workspaceCreateProgress", // complete failed
		"workspaceCreateFailed",
	})

	// Registration rollback: the cloud provisioning record is closed.
	statuses := recorder.closeStatuses()
	if len(statuses) == 0 || statuses[0] != "closed" {
		t.Fatalf("expected close with status closed, got %v", statuses)
	}
	if recorder.count(http.MethodPost, "/projects/project-1/workspaces") != 1 {
		t.Fatalf("expected one API create call, got %v", recorder.snapshot())
	}
}
