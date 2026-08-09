package daemon

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
	workspaceprtracker "yishan/apps/cli/internal/workspace/prtracker"
	workspacewatchers "yishan/apps/cli/internal/workspace/watchers"
)

func evalSymlinks(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func expectEventTopic(t *testing.T, events <-chan frontendEvent, wantTopic string) frontendEvent {
	t.Helper()
	deadline := time.After(3 * time.Second)

	for {
		select {
		case event := <-events:
			if event.Topic == wantTopic {
				return event
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %s event", wantTopic)
		}
	}
}

func expectNoEvent(t *testing.T, events <-chan frontendEvent, wait time.Duration) {
	t.Helper()

	select {
	case event := <-events:
		t.Fatalf("expected no event, got topic %q", event.Topic)
	case <-time.After(wait):
	}
}

func TestEventHubWorkspaceWatcherSink_PublishesWorkspaceFilesChangedPayload(t *testing.T) {
	hub := newEventHub()
	sink := newEventHubWorkspaceWatcherSink(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	sink.PublishWorkspaceFilesChanged(workspacewatchers.FilesChangedEvent{
		WorkspaceID:          "ws-1",
		WorktreePath:         "/tmp/ws-1",
		ChangedRelativePaths: []string{"a.txt", "nested/b.txt"},
	})

	event := expectEventTopic(t, events, "workspaceFilesChanged")
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["workspaceId"] != "ws-1" || payload["workspaceWorktreePath"] != "/tmp/ws-1" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	paths, ok := payload["changedRelativePaths"].([]string)
	if !ok || len(paths) != 2 {
		t.Fatalf("unexpected changedRelativePaths: %#v", payload["changedRelativePaths"])
	}
}

func TestPublishWorkspacePullRequestUpdatedEvent_PublishesPayload(t *testing.T) {
	hub := newEventHub()
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	publishWorkspacePullRequestUpdatedEvent(hub, workspaceprtracker.PullRequestUpdatedEvent{
		WorkspaceID:           "ws-1",
		WorkspaceWorktreePath: "/tmp/ws-1",
		PullRequest:           &workspace.WorkspacePullRequest{Number: 42, Status: "open"},
	})

	event := expectEventTopic(t, events, "workspacePullRequestUpdated")
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("expected map payload, got %T", event.Payload)
	}
	if payload["workspaceId"] != "ws-1" || payload["workspaceWorktreePath"] != "/tmp/ws-1" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	pullRequest, ok := payload["pullRequest"].(*workspace.WorkspacePullRequest)
	if !ok || pullRequest == nil || pullRequest.Number != 42 || pullRequest.Status != "open" {
		t.Fatalf("unexpected pull request payload: %#v", payload["pullRequest"])
	}
}

func TestJSONRPCHandler_InvalidatesFileCacheOnWorkspaceFilesChanged(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}

	manager := workspace.NewManager()
	openedWorkspace, err := manager.Open(workspace.OpenRequest{ID: "ws-1", Path: root})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	handle, err := manager.WorkspaceHandle(openedWorkspace.ID)
	if err != nil {
		t.Fatalf("workspace handle: %v", err)
	}

	entries, err := handle.FileList("", false)
	if err != nil {
		t.Fatalf("prime cache: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "a.txt" {
		t.Fatalf("unexpected initial entries: %+v", entries)
	}

	if err := os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}
	handler.events.Publish(frontendEvent{
		Topic: "workspaceFilesChanged",
		Payload: map[string]any{
			"workspaceWorktreePath": root,
			"changedRelativePaths":  []string{"b.txt"},
		},
	})
	time.Sleep(100 * time.Millisecond)

	entries, err = handle.FileList("", false)
	if err != nil {
		t.Fatalf("list after invalidation event: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected refreshed entries after invalidation event, got %+v", entries)
	}

	if err := os.WriteFile(filepath.Join(root, "c.txt"), []byte("c"), 0o644); err != nil {
		t.Fatal(err)
	}
	handler.events.Publish(frontendEvent{
		Topic: "workspaceFilesChanged",
		Payload: map[string]any{
			"workspaceWorktreePath": root,
			"changedRelativePaths":  []string{},
		},
	})
	time.Sleep(100 * time.Millisecond)

	entries, err = handle.FileList("", false)
	if err != nil {
		t.Fatalf("list after full invalidation event: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected refreshed entries after full invalidation event, got %+v", entries)
	}
}

func TestJSONRPCHandler_WatchActiveWorkspacesRegistersWatchersForHydratedWorkspaces(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

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
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: project.ID, NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: root, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	manager := workspace.NewManagerWithStore(workspaceStore)
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	// Hydration alone must not register watchers (the regression this guards):
	// without the explicit watch step, file-change events stop flowing after a
	// daemon restart.
	if handler.watchers.IsWatching(root) {
		t.Fatal("expected no watcher before hydration")
	}

	// Drive the same helper buildHandler uses at boot so removing the watch
	// step from the bootstrap sequence fails this test.
	if err := hydrateAndWatchWorkspaces(handler, manager); err != nil {
		t.Fatalf("hydrate and watch workspaces: %v", err)
	}

	hydratedWorkspace, err := manager.GetWorkspace("workspace-1")
	if err != nil {
		t.Fatalf("get hydrated workspace: %v", err)
	}
	if !handler.watchers.IsWatching(hydratedWorkspace.Path) {
		t.Fatalf("expected watcher registered for hydrated workspace path %q", hydratedWorkspace.Path)
	}
}

func TestJSONRPCHandler_HealthRecoveryRewatchesWorkspace(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	manager := workspace.NewManager()
	if _, err := manager.Open(workspace.OpenRequest{ID: "workspace-1", Path: root}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	handler.watchActiveWorkspaces()
	if !handler.watchers.IsWatching(root) {
		t.Fatal("expected watcher registered for active workspace")
	}

	// Path disappears: health check transitions to error and drops the watcher.
	movedPath := filepath.Join(t.TempDir(), "workspace-moved")
	if err := os.Rename(root, movedPath); err != nil {
		t.Fatalf("move workspace path: %v", err)
	}
	if _, _, _, err := handler.refreshWorkspaceHealth(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("refresh health (error transition): %v", err)
	}
	if handler.watchers.IsWatching(root) {
		t.Fatal("expected watcher dropped after error transition")
	}

	// Path returns: health check recovers the workspace to active and must
	// re-register the watcher so file-change events resume.
	if err := os.Rename(movedPath, root); err != nil {
		t.Fatalf("restore workspace path: %v", err)
	}
	if _, _, _, err := handler.refreshWorkspaceHealth(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("refresh health (recovery): %v", err)
	}
	if !handler.watchers.IsWatching(root) {
		t.Fatal("expected watcher re-registered after error-to-active recovery")
	}
}

func TestJSONRPCHandler_OpenProjectWorkspaceRegistersWatcherOnSkipPath(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	manager := workspace.NewManager()
	if _, err := manager.Open(workspace.OpenRequest{
		ID:        "workspace-1",
		Path:      root,
		ProjectID: "project-1",
		OrgID:     "org-1",
	}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	handler := NewJSONRPCHandler(manager, nil, "node-1", filepath.Join(root, "daemon.log"), nil, filepath.Join(root, "config.yml"), NewAppContextStore(""))
	defer handler.Shutdown()

	workspaceID, didOpen, err := handler.openProjectWorkspace(workspaceOpenProjectEntry{
		WorkspaceID:  "workspace-1",
		WorktreePath: root,
		ProjectID:    "project-1",
		OrgID:        "org-1",
	})
	if err != nil {
		t.Fatalf("openProjectWorkspace: %v", err)
	}
	if didOpen {
		t.Fatal("expected open to be skipped for already-open workspace")
	}
	if workspaceID != "workspace-1" {
		t.Fatalf("unexpected workspace id %q", workspaceID)
	}
	// The desktop warmup skips already-open workspaces; the watcher must still
	// be registered so file-change events flow (the Git Changes tab depends on
	// them).
	if !handler.watchers.IsWatching(root) {
		t.Fatal("expected watcher registered on openProject skip path")
	}
}
