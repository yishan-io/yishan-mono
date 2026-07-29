package daemon

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/config"
	localdb "yishan/apps/cli/internal/db"
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
	projectStore := localdb.NewProjectStore(database)
	project := localdb.Project{ID: "project-1", Name: "Project", OrganizationID: "org-1", ContextEnabled: true}
	if err := projectStore.Create(context.Background(), &project); err != nil {
		t.Fatalf("create project: %v", err)
	}
	handler.SetLocalDatabase(database)

	prepared := preparedWorkspaceCreate{registration: &WorkspaceCreation{
		ID: "workspace-1", NodeID: "node-1", OrganizationID: "org-1", ProjectID: project.ID,
		Kind: workspace.KindWorktree, Branch: "feature/local-db", SourceBranch: "main",
	}}
	created := workspace.Workspace{ID: "workspace-1", OrgID: "org-1", ProjectID: project.ID, Path: t.TempDir(), State: workspace.WorkspaceStateActive}

	if err := handler.persistPreparedWorkspace(context.Background(), prepared); err != nil {
		t.Fatalf("persist prepared workspace: %v", err)
	}
	provisioningWorkspace, err := localdb.NewWorkspaceStore(database).Get(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("get provisioning workspace: %v", err)
	}
	if provisioningWorkspace.Status != "provisioning" || provisioningWorkspace.LocalPath != "" {
		t.Fatalf("unexpected provisioning workspace: %#v", provisioningWorkspace)
	}
	if err := handler.finalizePersistedWorkspace(context.Background(), prepared, created); err != nil {
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

// newTestHandler creates a JSONRPCHandler for dispatch handler unit tests.
func newTestHandler(t *testing.T) *JSONRPCHandler {
	t.Helper()
	root := t.TempDir()
	manager := workspace.NewManager()
	h := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	t.Cleanup(func() { h.Shutdown() })
	return h
}

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

func TestHandleWorkspaceCreate_ReturnsPendingWhenAPIRegistrationIsSkipped(t *testing.T) {
	root := t.TempDir()
	manager := workspace.NewManager()
	handler := NewJSONRPCHandler(
		manager,
		nil,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()

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
	manager := workspace.NewManager()
	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := NewJSONRPCHandler(
		manager,
		runtime,
		"node-1",
		filepath.Join(root, "daemon.log"),
		nil,
		filepath.Join(root, "config.yml"),
		NewAppContextStore(""),
	)
	defer handler.Shutdown()
	subscriptionID, events := handler.events.Subscribe()
	defer handler.events.Unsubscribe(subscriptionID)

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

func installTokenUsageRecoveryProbe(t *testing.T, h *JSONRPCHandler) (string, *tokenUsageRecoveryProbe) {
	t.Helper()
	collector := &tokenUsageRecoveryProbe{
		recoverySinceByAgent: make(map[string]int64),
		needsRerun:           make(map[string]bool),
		inFlight:             map[string]bool{"recovery-probe": true},
	}
	h.tokenUsage = collector
	return "recovery-probe", collector
}

// TestHandleWorkspaceOpenProject_Success verifies that a valid, previously
// unknown workspace is opened, indexed, and returned in the opened list.
func TestHandleWorkspaceOpenProject_Success(t *testing.T) {
	dir := t.TempDir()
	h := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, h)

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
	h := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, h)

	// Pre-open the workspace directly in the manager with matching metadata.
	if _, err := h.manager.Open(workspace.OpenRequest{ID: "ws-2", Path: dir, ProjectID: "proj-2", OrgID: "org-2"}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(workspaceOpenProjectParams{
		Workspaces: []workspaceOpenProjectEntry{
			{WorkspaceID: "ws-2", WorktreePath: dir, ProjectID: "proj-2", OrgID: "org-2"},
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
	if collector.recoverySinceByAgent[recoveryProbeAgentKind] != 0 {
		t.Fatalf("expected no recovery scan request for pure skip")
	}
}

func TestHandleWorkspaceOpenProject_ReconcilesMissingMetadata(t *testing.T) {
	dir := t.TempDir()
	h := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, h)

	if _, err := h.manager.Open(workspace.OpenRequest{ID: "ws-3", Path: dir}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(workspaceOpenProjectParams{
		Workspaces: []workspaceOpenProjectEntry{{
			WorkspaceID:  "ws-3",
			WorktreePath: dir,
			ProjectID:    "proj-3",
			OrgID:        "org-3",
		}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := h.handleWorkspaceOpenProject(context.Background(), params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(workspaceOpenProjectResult)
	if len(result.Opened) != 1 || result.Opened[0] != "ws-3" {
		t.Fatalf("expected opened=[ws-3], got %v", result.Opened)
	}
	if len(result.Skipped) != 0 {
		t.Fatalf("expected no skipped entries, got %v", result.Skipped)
	}

	repairedWorkspace, err := h.manager.GetWorkspace("ws-3")
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

func TestExecuteWorktreeWorkspaceCreate_LocalProvisionFailureRollsBackRegisteredWorkspace(t *testing.T) {
	var closedWorkspaceID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/orgs/org-1/projects/project-1/workspaces":
			_, _ = w.Write([]byte(`{"workspace":{"id":"ws-api-rollback","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"provisioning","branch":"feature-fail","sourceBranch":"main","localPath":"","createdAt":"2026-06-30T00:00:00.000Z","updatedAt":"2026-06-30T00:00:00.000Z"}}`))
		case "/orgs/org-1/projects/project-1/workspaces/close":
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read close body: %v", err)
			}
			var payload map[string]string
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Fatalf("decode close body: %v", err)
			}
			closedWorkspaceID = payload["workspaceId"]
			_, _ = w.Write([]byte(`{"workspace":{"id":"ws-api-rollback","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"closed","branch":"feature-fail","sourceBranch":"main","localPath":"","createdAt":"2026-06-30T00:00:00.000Z","updatedAt":"2026-06-30T00:00:00.000Z"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	h := NewJSONRPCHandler(workspace.NewManager(), runtime, "node-1", filepath.Join(t.TempDir(), "daemon.log"), nil, filepath.Join(t.TempDir(), "config.yml"), NewAppContextStore(""))
	defer h.Shutdown()

	sourcePath := t.TempDir()
	prepared, err := h.registerPreparedWorkspace(context.Background(), preparedWorkspaceCreate{
		workspaceID:    "ws-local-1",
		organizationID: "org-1",
		projectID:      "project-1",
		localCreate: &workspace.CreateRequest{
			ID:             "ws-local-1",
			OrganizationID: "org-1",
			ProjectID:      "project-1",
			RepoKey:        "owner/repo",
			WorkspaceName:  "feature-fail",
			SourcePath:     sourcePath,
			TargetBranch:   "feature-fail",
			SourceBranch:   "main",
		},
		registration: &WorkspaceCreation{
			ID:             "ws-local-1",
			NodeID:         "node-1",
			OrganizationID: "org-1",
			ProjectID:      "project-1",
			Kind:           workspace.KindWorktree,
			Branch:         "feature-fail",
			SourceBranch:   "main",
		},
	})
	if err != nil {
		t.Fatalf("registerPreparedWorkspace: %v", err)
	}
	if prepared.workspaceID != "ws-local-1" {
		t.Fatalf("prepared.workspaceID = %q, want %q", prepared.workspaceID, "ws-local-1")
	}

	err = h.executeWorktreeWorkspaceCreate(context.Background(), prepared, nil)
	if err == nil {
		t.Fatal("expected local provisioning failure")
	}
	if closedWorkspaceID != "" {
		t.Fatalf("expected no remote close request, got %q", closedWorkspaceID)
	}
}

func TestExecuteWorktreeWorkspaceCreate_RemoteSyncFailureRollsBackLocalWorkspace(t *testing.T) {
	rt := cliruntime.New(&config.Config{
		API: config.APIConfig{
			BaseURL: "http://127.0.0.1:1",
			Token:   "test-token",
		},
	})

	root := t.TempDir()
	h := NewJSONRPCHandler(workspace.NewManager(), rt, "node-1", filepath.Join(root, "daemon.log"), nil, "", NewAppContextStore(""))
	t.Cleanup(func() { h.Shutdown() })

	srcDir := filepath.Join(root, "src-repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, srcDir)
	worktreePath, err := workspace.DefaultWorktreePath("test/repo", "feature-sync-fail")
	if err != nil {
		t.Fatalf("DefaultWorktreePath: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(worktreePath)
	})

	prepared := preparedWorkspaceCreate{
		workspaceID:    "ws-sync-fail",
		organizationID: "org-1",
		projectID:      "proj-1",
		registration: &WorkspaceCreation{
			ID:             "ws-sync-fail",
			OrganizationID: "org-1",
			ProjectID:      "proj-1",
		},
		localCreate: &workspace.CreateRequest{
			ID:             "ws-sync-fail",
			OrganizationID: "org-1",
			ProjectID:      "proj-1",
			RepoKey:        "test/repo",
			WorkspaceName:  "feature-sync-fail",
			SourcePath:     srcDir,
			TargetBranch:   "feature-sync-fail",
			SourceBranch:   "main",
		},
		isRelayed: true,
	}

	err = h.executeWorktreeWorkspaceCreate(context.Background(), prepared, nil)
	if err != nil {
		t.Fatalf("expected local creation without remote sync, got %v", err)
	}
	if _, getErr := h.manager.GetWorkspace("ws-sync-fail"); getErr != nil {
		t.Fatalf("expected workspace to remain in manager: %v", getErr)
	}
	if _, statErr := os.Stat(worktreePath); statErr != nil {
		t.Fatalf("expected worktree path after local creation: %v", statErr)
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
