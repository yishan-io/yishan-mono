package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/relay"
	"yishan/apps/cli/internal/adapter/sqlite"
	domainlocaltask "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/worktree"
)

// ============================= create, local node =============================

func TestCreateLocalNode_EventSequence(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", openMigratedTestDB(t))
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	worktreePath, err := worktree.DefaultWorktreePath("owner/repo", "feature-seq")
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

	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw)
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
	store := sqlite.NewWorkspaceStore(s.deps.Database)
	row, err := store.Get(context.Background(), "ws-seq-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "active" || row.LocalPath != createdPath || row.State != string(workspace.StateActive) {
		t.Fatalf("persisted workspace = %#v, want status active state active localPath %q", row, createdPath)
	}

	// In-memory runtime record.
	ws, ok := s.deps.Registry.Get("ws-seq-1")
	if !ok || ws.State != workspace.StateActive {
		t.Fatalf("manager workspace = %#v, ok %v; want active", ws, ok)
	}
}

// ============================= create, remote node =============================

func TestCreateRemoteNode_EventSequence(t *testing.T) {
	var recorder apiCallRecorder
	apiServer := newWorkspaceAPIStub(t, &recorder)
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)
	relayMessages := wireRelayCapture(t, s, map[string]any{"accepted": true})

	raw, err := json.Marshal(map[string]any{
		"id": "ws-remote-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-2",
		"branch": "feature-remote", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
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
	if envelope.Change != relay.ChangeCreateRequest {
		t.Fatalf("relay change = %q, want %q", envelope.Change, relay.ChangeCreateRequest)
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
	if _, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), "ws-remote-1"); err == nil {
		t.Fatal("expected no local SQLite row for remote-target create")
	}
	if len(s.deps.Registry.List()) != 0 {
		t.Fatalf("expected no manager runtime records, got %v", s.deps.Registry.List())
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
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	nonGitSource := t.TempDir() // exists but is not a git repo → worktree step fails

	raw, err := json.Marshal(map[string]any{
		"id": "ws-fail-1", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/repo", "workspaceName": "feature-fail", "sourcePath": nonGitSource,
		"targetBranch": "feature-fail", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
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
	row, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), "ws-fail-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.Status != "closed" {
		t.Fatalf("persisted status = %q, want closed", row.Status)
	}
	if len(s.deps.Registry.List()) != 0 {
		t.Fatalf("expected no manager runtime records after failed create, got %v", s.deps.Registry.List())
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
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

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

	worktreePath, err := worktree.DefaultWorktreePath("owner/ctxfail", "feature-ctxfail")
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
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
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
	row, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), "ws-ctxfail")
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

	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, nil, "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	worktreePath, err := worktree.DefaultWorktreePath("owner/warnrepo", "feature-warn")
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
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
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
	row, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), "ws-warn")
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
	database := openMigratedTestDB(t)
	s := newBehaviorHandler(t, apiConfiguredRuntime(apiServer), "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)
	wireRelayCapture(t, s, map[string]any{"accepted": false, "reason": "target node offline"})

	raw, err := json.Marshal(map[string]any{
		"id": "ws-rejected", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-2",
		"branch": "feature-rejected", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
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

// TestCreateLocalNode_CompletesWhenCloudUnavailable records that cloud record
// writes are best-effort: an unreachable API must not fail a local create —
// the local SQLite row stays authoritative and the create completes.
func TestCreateLocalNode_CompletesWhenCloudUnavailable(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	database := openMigratedTestDB(t)
	unreachableRuntime := session.New(&config.Config{API: config.APIConfig{BaseURL: "http://127.0.0.1:1", Token: "test-token"}})
	s := newBehaviorHandler(t, unreachableRuntime, "node-1", database)
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	worktreePath, err := worktree.DefaultWorktreePath("owner/unreachable", "feature-unreachable")
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(worktreePath) })

	raw, err := json.Marshal(map[string]any{
		"id": "ws-unreachable", "organizationId": "org-1", "projectId": "project-1", "nodeId": "node-1",
		"repoKey": "owner/unreachable", "workspaceName": "feature-unreachable", "sourcePath": sourceRepo,
		"targetBranch": "feature-unreachable", "sourceBranch": "main",
	})
	if err != nil {
		t.Fatalf("marshal create params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
		t.Fatalf("handleWorkspaceCreate: %v", err)
	}

	events := collectUntil(t, eventCh, "workspaceCreateCompleted", 30*time.Second)
	if lifecycle := lifecycleTopicNames(events); containsString(lifecycle, "workspaceCreateFailed") {
		t.Fatalf("cloud write failures must not fail the create: %v", lifecycle)
	}
	if _, statErr := os.Stat(worktreePath); statErr != nil {
		t.Fatalf("worktree missing after create: %v", statErr)
	}
	row, err := sqlite.NewWorkspaceStore(database).Get(context.Background(), "ws-unreachable")
	if err != nil || row.Status != "active" {
		t.Fatalf("persisted workspace = %#v, err %v; want status active", row, err)
	}
	if _, ok := s.deps.Registry.Get("ws-unreachable"); !ok {
		t.Fatal("manager workspace missing")
	}
}

func TestCreateLocalTask_LinksBeforeCreateAcceptance(t *testing.T) {
	root := t.TempDir()
	sourceRepo := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, sourceRepo)

	var linkedTaskID, linkedWorkspaceID string
	s := newBehaviorHandler(t, nil, "node-1", openMigratedTestDB(t))
	s.deps.LinkLocalTaskWorkspace = func(_ context.Context, taskID string, workspaceID string) error {
		linkedTaskID, linkedWorkspaceID = taskID, workspaceID
		return nil
	}

	raw := json.RawMessage(`{"id":"ws-task-link","localTaskId":"task-1","organizationId":"org-1","projectId":"project-1","nodeId":"node-1","repoKey":"owner/repo","workspaceName":"task-link","sourcePath":"` + sourceRepo + `","targetBranch":"task-link","sourceBranch":"main","taskRun":{"agentKind":"pi","prompt":"Implement task"}}`)
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw)
	if err != nil {
		t.Fatalf("workspace create: %v", err)
	}
	accepted, ok := result.(map[string]any)
	if !ok || accepted["workspaceName"] != "task-link" || accepted["branch"] != "task-link" {
		t.Fatalf("create acceptance = %#v, want resolved workspaceName and branch", result)
	}
	if linkedTaskID != "task-1" || linkedWorkspaceID != "ws-task-link" {
		t.Fatalf("link = (%q, %q), want (task-1, ws-task-link)", linkedTaskID, linkedWorkspaceID)
	}
}

func TestCreateLocalTask_ProvisionFailureUnlinksWorkspace(t *testing.T) {
	database := openMigratedTestDB(t)
	taskRepository := sqlite.NewLocalTaskStore(database)
	if _, err := taskRepository.Create(context.Background(), domainlocaltask.Task{
		ID: "task-1", Title: "Task", Status: domainlocaltask.StatusNew, Priority: domainlocaltask.PriorityMedium,
	}); err != nil {
		t.Fatalf("create local task: %v", err)
	}
	localTaskSvc := nodelocaltask.NewService(nodelocaltask.Deps{
		Repository: taskRepository, WorkspaceStore: sqlite.NewStore(sqlite.NewWorkspaceStore(database)),
	})
	s := newBehaviorHandler(t, nil, "node-1", database)
	s.deps.LinkLocalTaskWorkspace = func(ctx context.Context, taskID string, workspaceID string) error {
		_, err := localTaskSvc.LinkWorkspace(ctx, rpc.LocalTaskLinkWorkspaceParams{TaskID: taskID, WorkspaceID: workspaceID})
		return err
	}
	s.deps.UnlinkLocalTaskWorkspace = localTaskSvc.UnlinkWorkspaceAssociations
	subscriptionID, eventCh := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	raw := json.RawMessage(`{"id":"ws-task-fail","localTaskId":"task-1","organizationId":"org-1","projectId":"project-1","nodeId":"node-1","repoKey":"owner/repo","workspaceName":"task-fail","sourcePath":"` + t.TempDir() + `","targetBranch":"task-fail","sourceBranch":"main"}`)
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCreate, raw); err != nil {
		t.Fatalf("workspace create: %v", err)
	}
	collectUntil(t, eventCh, "workspaceCreateFailed", 20*time.Second)
	failedTask, err := taskRepository.Get(context.Background(), "task-1")
	if err != nil {
		t.Fatalf("get local task: %v", err)
	}
	if failedTask.HasActiveWorkspace {
		t.Fatal("failed provisioning retained an active Local Task workspace association")
	}
}
