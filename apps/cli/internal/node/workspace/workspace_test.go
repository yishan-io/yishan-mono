package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/rpc"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
)

func TestPersistPreparedWorkspace_FinalizesSQLiteRecord(t *testing.T) {
	handler := newTestHandler(t)
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.setTestDatabase(database)

	prepared := preparedWorkspaceCreate{Registration: &WorkspaceCreation{
		ID: "workspace-1", NodeID: "node-1", OrganizationID: "org-1", ProjectID: "project-1",
		Kind: workspace.KindWorktree, Branch: "feature/local-db", SourceBranch: "main",
	}}
	created := workspace.Workspace{ID: "workspace-1", OrgID: "org-1", ProjectID: "project-1", Path: t.TempDir(), State: workspace.StateActive}

	if err := handler.PersistPlan(context.Background(), prepared); err != nil {
		t.Fatalf("persist prepared workspace: %v", err)
	}
	provisioningWorkspace, err := localdb.NewWorkspaceStore(database).Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("get provisioning workspace: %v", err)
	}
	if provisioningWorkspace.Status != "provisioning" || provisioningWorkspace.LocalPath != "" {
		t.Fatalf("unexpected provisioning workspace: %#v", provisioningWorkspace)
	}
	if err := handler.Finalize(context.Background(), prepared, created); err != nil {
		t.Fatalf("finalize persisted workspace: %v", err)
	}
	storedWorkspace, err := localdb.NewWorkspaceStore(database).Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if storedWorkspace.Status != "active" || storedWorkspace.LocalPath != created.Path || storedWorkspace.Branch == nil || *storedWorkspace.Branch != "feature/local-db" {
		t.Fatalf("unexpected persisted workspace: %#v", storedWorkspace)
	}
}

// newTestHandler creates a Service for dispatch handler unit tests.

func TestPublishWorkspaceSnapshotChanged_PublishesLocalInvalidationEvent(t *testing.T) {
	s := newTestHandler(t)
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	s.PublishSnapshotChanged("org-1", "project-1", "workspace-1", "updated")

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

func TestHandleWorkspaceCreate_ReturnsPendingWhenAPIRegistrationIsSkipped(t *testing.T) {
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

func TestHandleWorkspaceCreate_UsesAuthoritativeAPIWorkspaceID(t *testing.T) {
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

func (p *tokenUsageRecoveryProbe) StartStartupScan()   {}
func (p *tokenUsageRecoveryProbe) SyncNow(_ string)    {}
func (p *tokenUsageRecoveryProbe) Trigger(_, _ string) {}
func (p *tokenUsageRecoveryProbe) Close()              {}
func (p *tokenUsageRecoveryProbe) DebugState() tokenusage.CollectorDebugState {
	return tokenusage.CollectorDebugState{}
}
func (p *tokenUsageRecoveryProbe) RequestRecentRecoveryScan(_ string) {
	now := time.Now().UTC().UnixMilli()
	for agentKind := range p.inFlight {
		p.recoverySinceByAgent[agentKind] = now
		if p.inFlight[agentKind] {
			p.needsRerun[agentKind] = true
		}
	}
}

func installTokenUsageRecoveryProbe(t *testing.T, services *Service) (string, *tokenUsageRecoveryProbe) {
	t.Helper()
	collector := &tokenUsageRecoveryProbe{
		recoverySinceByAgent: make(map[string]int64),
		needsRerun:           make(map[string]bool),
		inFlight:             map[string]bool{"recovery-probe": true},
	}
	services.deps.TokenUsage = collector
	return "recovery-probe", collector
}

// TestHandleWorkspaceOpenProject_Success verifies that a valid, previously
// unknown workspace is opened, indexed, and returned in the opened list.
func TestHandleWorkspaceOpenProject_Success(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "ws-1", WorktreePath: dir, ProjectID: "proj-1", OrgID: "org-1"},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result, ok := raw.(rpc.WorkspaceOpenProjectResult)
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
	if _, err := s.GetWorkspace("ws-1"); err != nil {
		t.Errorf("workspace ws-1 should be in manager after openProject: %v", err)
	}

	if collector.recoverySinceByAgent[recoveryProbeAgentKind] == 0 {
		t.Fatalf("expected recovery scan to be requested for opened workspace")
	}
	if !collector.needsRerun[recoveryProbeAgentKind] {
		t.Fatalf("expected recovery scan to mark in-flight agent for rerun")
	}
}

// TestHandleWorkspaceOpenProject_Idempotent verifies that calling openProject
// for a workspace already in the manager skips it when metadata already matches.
func TestHandleWorkspaceOpenProject_Idempotent(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	// Pre-open the workspace directly in the manager with matching metadata.
	if _, err := s.Open(workspace.OpenRequest{ID: "ws-2", Path: dir, ProjectID: "proj-2", OrgID: "org-2"}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "ws-2", WorktreePath: dir, ProjectID: "proj-2", OrgID: "org-2"},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
	if len(result.Opened) != 0 {
		t.Errorf("expected no opened, got %v", result.Opened)
	}
	if len(result.Skipped) != 1 || result.Skipped[0] != "ws-2" {
		t.Errorf("expected skipped=[ws-2], got %v", result.Skipped)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
	if collector.recoverySinceByAgent[recoveryProbeAgentKind] != 0 {
		t.Fatalf("expected no recovery scan request for pure skip")
	}
}

func TestHandleWorkspaceOpenProject_ReconcilesMissingMetadata(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	if _, err := s.Open(workspace.OpenRequest{ID: "ws-3", Path: dir}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{{
			WorkspaceID:  "ws-3",
			WorktreePath: dir,
			ProjectID:    "proj-3",
			OrgID:        "org-3",
		}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
	if len(result.Opened) != 1 || result.Opened[0] != "ws-3" {
		t.Fatalf("expected opened=[ws-3], got %v", result.Opened)
	}
	if len(result.Skipped) != 0 {
		t.Fatalf("expected no skipped entries, got %v", result.Skipped)
	}

	repairedWorkspace, err := s.GetWorkspace("ws-3")
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if repairedWorkspace.ProjectID != "proj-3" {
		t.Fatalf("expected repaired project id %q, got %q", "proj-3", repairedWorkspace.ProjectID)
	}
	if repairedWorkspace.OrgID != "org-3" {
		t.Fatalf("expected repaired org id %q, got %q", "org-3", repairedWorkspace.OrgID)
	}

	if collector.recoverySinceByAgent[recoveryProbeAgentKind] == 0 {
		t.Fatalf("expected recovery scan to be requested after metadata reconciliation")
	}
	if !collector.needsRerun[recoveryProbeAgentKind] {
		t.Fatalf("expected recovery scan to mark in-flight agent for rerun after metadata reconciliation")
	}
}

// TestHandleWorkspaceOpenProject_MissingFields verifies that entries with
// empty workspaceId or worktreePath produce error entries, not panics.
func TestHandleWorkspaceOpenProject_MissingFields(t *testing.T) {
	s := newTestHandler(t)

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "", WorktreePath: ""},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
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
	s := newTestHandler(t)

	params, err := json.Marshal(rpc.WorkspaceCloseProjectParams{
		WorkspaceIDs: []string{"ws-a", "ws-b", ""},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCloseProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceCloseProject: %v", err)
	}

	result := raw.(rpc.WorkspaceCloseProjectResult)
	// Empty string entry must be filtered out.
	if len(result.Stopped) != 2 {
		t.Errorf("expected 2 stopped entries (empty string filtered), got %v", result.Stopped)
	}
	if result.Stopped[0] != "ws-a" || result.Stopped[1] != "ws-b" {
		t.Errorf("unexpected stopped order: %v", result.Stopped)
	}
}

func newCloseRoutingTestHandler(t *testing.T, workspaceNodeID string) *Service {
	t.Helper()
	s := newTestHandler(t)
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := localdb.NewWorkspaceStore(database).Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: workspaceNodeID,
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: "/tmp/ws", State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	s.setTestDatabase(database)
	// Keep the close-routing test fast: the token-usage scan on close is
	// incidental to the routing decision under test.
	s.deps.TokenUsage = nil
	return s
}

func TestHandleWorkspaceClose_RemoteNode_RelaysInsteadOfLocalClose(t *testing.T) {
	s := newCloseRoutingTestHandler(t, "node-remote")
	params, err := json.Marshal(workspaceCloseParams{
		WorkspaceID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	_, err = s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, params)
	if err == nil || !strings.Contains(err.Error(), "relay not connected") {
		t.Fatalf("expected relay path (relay not connected), got err=%v", err)
	}
}

func TestHandleWorkspaceClose_LocalNode_TakesLocalClosePath(t *testing.T) {
	s := newCloseRoutingTestHandler(t, "node-1")
	params, err := json.Marshal(workspaceCloseParams{
		WorkspaceID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	_, err = s.callRPCForTest(context.Background(), rpc.MethodWorkspaceClose, params)
	if err == nil || strings.Contains(err.Error(), "relay not connected") {
		t.Fatalf("expected local close path (not relay), got err=%v", err)
	}
}

func initDispatchWorkspaceTestGitRepoWithCommit(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("mkdir repo root: %v", err)
	}
	runDispatchWorkspaceTestGitCmd(t, root, "init", "-b", "main")
	runDispatchWorkspaceTestGitCmd(t, root, "config", "user.name", "Test")
	runDispatchWorkspaceTestGitCmd(t, root, "config", "user.email", "test@example.com")
	seedFile := filepath.Join(root, "seed.txt")
	if err := os.WriteFile(seedFile, []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runDispatchWorkspaceTestGitCmd(t, root, "add", "seed.txt")
	runDispatchWorkspaceTestGitCmd(t, root, "commit", "-m", "initial commit")
}

func runDispatchWorkspaceTestGitCmd(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(out))
	}
}

func TestCheckWorkspaceHealth_MarksMissingPathWorkspaceError(t *testing.T) {
	s := newTestHandler(t)
	workspacePath := t.TempDir()
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "proj-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	subscriptionID, events := s.deps.Events.Subscribe()
	defer s.deps.Events.Unsubscribe(subscriptionID)

	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}

	s.CheckHealth(context.Background())

	ws, err := s.GetWorkspace("ws-1")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if ws.State != workspace.StateError || ws.Health != workspace.HealthPathMissing {
		t.Fatalf("expected error/path-missing, got state=%q health=%q", ws.State, ws.Health)
	}

	select {
	case event := <-events:
		payload, ok := event.Payload.(map[string]any)
		if !ok || payload["workspaceId"] != "ws-1" || payload["state"] != string(workspace.StateError) {
			t.Fatalf("unexpected state changed event: %#v", event.Payload)
		}
	case <-time.After(time.Second):
		t.Fatal("expected workspace state changed event")
	}
}

func TestCheckWorkspaceHealth_KeepsHealthyWorkspaceActive(t *testing.T) {
	s := newTestHandler(t)
	workspacePath := t.TempDir()
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "proj-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	s.CheckHealth(context.Background())

	ws, err := s.GetWorkspace("ws-1")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	if ws.State != workspace.StateActive {
		t.Fatalf("expected healthy workspace to stay active, got %q", ws.State)
	}
}

func TestCheckWorkspaceHealth_PersistsErrorState(t *testing.T) {
	s := newTestHandler(t)
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	s.setTestDatabase(database)

	workspacePath := t.TempDir()
	branch := "feature/health"
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, LocalPath: workspacePath, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if _, err := s.Open(workspace.OpenRequest{
		ID: "ws-1", Path: workspacePath, OrgID: "org-1", ProjectID: "project-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("remove workspace path: %v", err)
	}

	s.CheckHealth(context.Background())

	persisted, err := workspaceStore.Get(context.Background(), "ws-1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if persisted.State != string(workspace.StateError) || persisted.Health == nil || *persisted.Health != string(workspace.HealthPathMissing) {
		t.Fatalf("expected persisted error/path-missing, got state=%q health=%v", persisted.State, persisted.Health)
	}
}
