package node

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	localdb "yishan/apps/cli/internal/db"
	internalevents "yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/files"
	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/terminal"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
	workspaceprtracker "yishan/apps/cli/internal/workspace/pr"
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

func TestEventHubWorkspaceWatcherSink_PublishesWorkspaceFilesChangedPayload(t *testing.T) {
	hub := internalevents.NewHub()
	sink := newEventHubWorkspaceWatcherSink(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	sink.PublishWorkspaceFilesChanged(workspacewatchers.FilesChangedEvent{
		WorkspaceID:          "ws-1",
		WorktreePath:         "/tmp/ws-1",
		ChangedRelativePaths: []string{"a.txt", "b/c.txt"},
	})

	event := expectEventTopic(t, events, "workspaceFilesChanged")
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("payload type = %T, want map[string]any", event.Payload)
	}
	if payload["workspaceId"] != "ws-1" || payload["workspaceWorktreePath"] != "/tmp/ws-1" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	paths, ok := payload["changedRelativePaths"].([]string)
	if !ok || len(paths) != 2 || paths[0] != "a.txt" || paths[1] != "b/c.txt" {
		t.Fatalf("unexpected changed paths: %#v", payload["changedRelativePaths"])
	}
}

func TestEventHubWorkspaceWatcherSink_PublishesGitChangedPayload(t *testing.T) {
	hub := internalevents.NewHub()
	sink := newEventHubWorkspaceWatcherSink(hub)
	subscriptionID, events := hub.Subscribe()
	defer hub.Unsubscribe(subscriptionID)

	sink.PublishGitChanged(workspacewatchers.GitChangedEvent{
		WorkspaceID:   "ws-1",
		WorktreePath:  "/tmp/ws-1",
		AffectsBranch: true,
		CurrentBranch: "feature-a",
	})

	event := expectEventTopic(t, events, "gitChanged")
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		t.Fatalf("payload type = %T, want map[string]any", event.Payload)
	}
	if payload["workspaceId"] != "ws-1" || payload["affectsBranch"] != true || payload["currentBranch"] != "feature-a" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestPublishWorkspacePullRequestUpdatedEvent(t *testing.T) {
	hub := internalevents.NewHub()
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
		t.Fatalf("payload type = %T, want map[string]any", event.Payload)
	}
	if payload["workspaceId"] != "ws-1" || payload["workspaceWorktreePath"] != "/tmp/ws-1" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
	pullRequest, ok := payload["pullRequest"].(*workspace.WorkspacePullRequest)
	if !ok || pullRequest == nil || pullRequest.Number != 42 || pullRequest.Status != "open" {
		t.Fatalf("unexpected pull request payload: %#v", payload["pullRequest"])
	}
}

func TestApp_InvalidatesFileCacheOnWorkspaceFilesChanged(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}

	app := newWatchTestApp(t)
	openedWorkspace, err := app.OpenWorkspace(workspace.OpenRequest{ID: "ws-1", Path: root})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}
	app.StartFileCacheConsumer()

	handle := instance.NewHandle(openedWorkspace, app.files, app.git, app.terminals)

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
	app.events.Publish(internalevents.Event{
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
	app.events.Publish(internalevents.Event{
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

func TestApp_WatchActiveWorkspacesRegistersWatchersForHydratedWorkspaces(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	database := openCleanupStoreTestDB(t)
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: root, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	app := newWatchTestApp(t)
	app.store = localdb.NewStore(workspaceStore)

	// Hydration alone must not register watchers (the regression this guards):
	// without the explicit watch step, file-change events stop flowing after a
	// daemon restart.
	if app.watchers.IsWatching(root) {
		t.Fatal("expected no watcher before hydration")
	}

	// Drive the same sequence Bootstrap uses at boot so removing the watch
	// step from the bootstrap sequence fails this test.
	if err := app.HydrateFromDB(context.Background()); err != nil {
		t.Fatalf("hydrate workspaces: %v", err)
	}
	app.WatchActiveWorkspaces()

	hydratedWorkspace, ok := app.registry.Get("workspace-1")
	if !ok {
		t.Fatal("get hydrated workspace: not found")
	}
	if !app.watchers.IsWatching(hydratedWorkspace.Path) {
		t.Fatalf("expected watcher registered for hydrated workspace path %q", hydratedWorkspace.Path)
	}
}

func TestApp_HealthRecoveryRewatchesWorkspace(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}

	app := newWatchTestApp(t)
	if _, err := app.OpenWorkspace(workspace.OpenRequest{ID: "workspace-1", Path: root}); err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	app.WatchActiveWorkspaces()
	if !app.watchers.IsWatching(root) {
		t.Fatal("expected watcher registered for active workspace")
	}

	// Path disappears: health check transitions to error and drops the watcher.
	movedPath := filepath.Join(t.TempDir(), "workspace-moved")
	if err := os.Rename(root, movedPath); err != nil {
		t.Fatalf("move workspace path: %v", err)
	}
	if _, _, _, err := app.RefreshWorkspaceHealth(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("refresh health (error transition): %v", err)
	}
	if app.watchers.IsWatching(root) {
		t.Fatal("expected watcher dropped after error transition")
	}

	// Path returns: health check recovers the workspace to active and must
	// re-register the watcher so file-change events resume.
	if err := os.Rename(movedPath, root); err != nil {
		t.Fatalf("restore workspace path: %v", err)
	}
	if _, _, _, err := app.RefreshWorkspaceHealth(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("refresh health (recovery): %v", err)
	}
	if !app.watchers.IsWatching(root) {
		t.Fatal("expected watcher re-registered after error-to-active recovery")
	}
}

// newWatchTestApp builds a minimal app for watcher/file-cache behavior tests.
func newWatchTestApp(t *testing.T) *App {
	t.Helper()
	events := internalevents.NewHub()
	filesService := files.NewFileService()
	registry := instance.NewRegistry(filesService)
	gitService := git.NewGitService()
	terminals := terminal.NewManager()
	prTracker := workspaceprtracker.New(workspaceprtracker.TrackerDeps{
		Instances: registry,
		Gits:      gitService,
		Runtime:   nil,
		OnPullRequestUpdated: func(event workspaceprtracker.PullRequestUpdatedEvent) {
			PublishPullRequestUpdated(events, event)
		},
	})
	watchers := NewWatchers(events, prTracker.RefreshWorkspaceByPath)
	registry.SetOnRemoved(func(workspaceID string, path string) {
		watchers.Unwatch(path)
		prTracker.StopTracking(workspaceID)
	})
	app := &App{
		registry:     registry,
		files:        filesService,
		git:          gitService,
		terminals:    terminals,
		events:       events,
		watchers:     watchers,
		prTracker:    prTracker,
		contextStore: NewContextStore(""),
		Runtime:      nil,
		NodeID:       "node-1",
		logFilePath:  filepath.Join(t.TempDir(), "daemon.log"),
		settingsPath: filepath.Join(t.TempDir(), "config.yml"),
		serverCtx:    context.Background(),
	}
	t.Cleanup(func() { _ = app.Close() })
	return app
}
