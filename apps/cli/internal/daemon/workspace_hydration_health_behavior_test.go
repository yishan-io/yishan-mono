package daemon

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/dbconv"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// ============================= startup hydration =============================

func TestHydrateFromDB_SkipsClosingStatusRow(t *testing.T) {
	database := openMigratedTestDB(t)
	store := localdb.NewWorkspaceStore(database)
	path := t.TempDir() // exists: proves the row is not opened
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "ws-closing", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "closing", LocalPath: path,
		State: workspace.WorkspaceStateClosing,
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	manager := workspace.NewManagerWithStore(dbconv.NewStore(store))
	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("HydrateFromDB: %v", err)
	}
	// A closing row is a tombstone-for-listing: it must not be restored, and
	// it must not be promoted to error (which would resurrect it as closable).
	if len(manager.Instances().List()) != 0 {
		t.Fatalf("expected closing row skipped, got %v", manager.Instances().List())
	}
}

func TestHydrateFromDB_ResetsErrorHealthOnRecoveredRow(t *testing.T) {
	database := openMigratedTestDB(t)
	store := localdb.NewWorkspaceStore(database)
	path := t.TempDir() // exists, so the row can be opened
	health := workspace.WorkspaceHealthPathMissing
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID: "ws-recovered", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: path,
		State: workspace.WorkspaceStateActive, Health: &health,
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	manager := workspace.NewManagerWithStore(dbconv.NewStore(store))
	if err := manager.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("HydrateFromDB: %v", err)
	}

	ws, ok := manager.Instances().Get("ws-recovered")
	if !ok {
		t.Fatalf("get hydrated workspace: not found")
	}
	if ws.State != workspace.WorkspaceStateActive || ws.Health != "" {
		t.Fatalf("hydrated workspace = %#v, want state active health empty", ws)
	}
	row, err := store.Get(context.Background(), "ws-recovered")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.State != workspace.WorkspaceStateActive || row.Health == nil || *row.Health != "" {
		t.Fatalf("persisted row = %#v, want state active health reset to empty", row)
	}
}

// ============================= health transitions =============================

func TestHealthTransition_NotWorktree(t *testing.T) {
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, nil, "node-1", database)
	subscriptionID, eventCh := h.events.Subscribe()
	defer h.events.Unsubscribe(subscriptionID)

	// A path whose .git entry is a regular file is not a worktree: the health
	// check must mark it error/not-worktree (not path-missing).
	path := t.TempDir()
	if err := os.WriteFile(filepath.Join(path, ".git"), []byte("not a git dir"), 0o644); err != nil {
		t.Fatalf("write .git file: %v", err)
	}
	openLocalWorkspace(t, manager, "ws-h1", path)
	if err := localdb.NewWorkspaceStore(database).Create(context.Background(), &localdb.Workspace{
		ID: "ws-h1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: path,
		State: workspace.WorkspaceStateActive,
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	raw, err := json.Marshal(map[string]any{"workspaceId": "ws-h1"})
	if err != nil {
		t.Fatalf("marshal health params: %v", err)
	}
	result, err := h.handleWorkspaceHealth(context.Background(), raw)
	if err != nil {
		t.Fatalf("handleWorkspaceHealth: %v", err)
	}
	healthResult, ok := result.(workspaceHealthResult)
	if !ok {
		t.Fatalf("health result = %T, want workspaceHealthResult", result)
	}
	if healthResult.State != workspace.WorkspaceStateError || healthResult.Health != workspace.WorkspaceHealthNotWorktree {
		t.Fatalf("health result = %#v, want state error health not-worktree", healthResult)
	}

	// State change is persisted and published.
	row, err := localdb.NewWorkspaceStore(database).Get(context.Background(), "ws-h1")
	if err != nil {
		t.Fatalf("get persisted workspace: %v", err)
	}
	if row.State != workspace.WorkspaceStateError || row.Health == nil || *row.Health != workspace.WorkspaceHealthNotWorktree {
		t.Fatalf("persisted row = %#v, want error/not-worktree", row)
	}
	stateEvents := []frontendEvent{}
	for _, event := range collectFor(t, eventCh, 200*time.Millisecond) {
		if event.Topic == "workspaceStateChanged" {
			stateEvents = append(stateEvents, event)
		}
	}
	if len(stateEvents) != 1 {
		t.Fatalf("expected one workspaceStateChanged event, got %v", eventTopicNames(stateEvents))
	}
	payload := stateEvents[0].Payload.(map[string]any)
	if payload["state"] != workspace.WorkspaceStateError || payload["health"] != workspace.WorkspaceHealthNotWorktree {
		t.Fatalf("workspaceStateChanged payload = %#v", payload)
	}
}

func TestHealthTransition_FolderWorkspaceSkipsGitCheck(t *testing.T) {
	manager := workspace.NewManager()
	database := openMigratedTestDB(t)
	h := newBehaviorHandler(t, manager, nil, "node-1", database)

	// A folder workspace is a plain directory (no git) but must stay healthy.
	path := t.TempDir()
	openLocalWorkspace(t, manager, "ws-folder", path)
	if err := localdb.NewWorkspaceStore(database).Create(context.Background(), &localdb.Workspace{
		ID: "ws-folder", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: string(workspace.KindFolder), Status: "active", LocalPath: path,
		State: workspace.WorkspaceStateActive,
	}); err != nil {
		t.Fatalf("create persisted workspace: %v", err)
	}

	state, health, healthErr, err := h.refreshWorkspaceHealth(context.Background(), "ws-folder")
	if err != nil {
		t.Fatalf("refreshWorkspaceHealth: %v", err)
	}
	if state != workspace.WorkspaceStateActive || health != "" || healthErr != "" {
		t.Fatalf("folder health = state %q health %q err %q, want active/''/''", state, health, healthErr)
	}
}

func TestHealthTransition_RecoveryReRegistersWatcher(t *testing.T) {
	root := t.TempDir()
	gitRepo := filepath.Join(root, "repo")
	initDispatchWorkspaceTestGitRepoWithCommit(t, gitRepo)

	manager := workspace.NewManager()
	h := newBehaviorHandler(t, manager, nil, "node-1", nil)
	openLocalWorkspace(t, manager, "ws-recover", gitRepo)
	if err := manager.Instances().SetState("ws-recover", string(instance.StateError), string(instance.HealthPathMissing)); err != nil {
		t.Fatalf("SetState: %v", err)
	}
	if h.watchers.IsWatching(gitRepo) {
		t.Fatal("watcher must not be registered before health recovery")
	}

	state, health, _, err := h.refreshWorkspaceHealth(context.Background(), "ws-recover")
	if err != nil {
		t.Fatalf("refreshWorkspaceHealth: %v", err)
	}
	if state != workspace.WorkspaceStateActive || health != "" {
		t.Fatalf("recovered health = state %q health %q, want active/''", state, health)
	}
	// The watcher is registered under the canonicalized path (EvalSymlinks
	// resolves /var → /private/var on macOS), so assert against the manager's
	// resolved path, not the raw test path.
	ws, ok := manager.Instances().Get("ws-recover")
	if !ok {
		t.Fatal("get workspace: not found")
	}
	if !h.watchers.IsWatching(ws.Path) {
		t.Fatal("watcher must be re-registered after recovery from error")
	}
}
