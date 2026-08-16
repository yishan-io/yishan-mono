package project

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	cliruntime "yishan/apps/cli/internal/adapter/cloud/session"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/workspace"
)

func TestListWithWorkspaces_OverlaysLocalStatusWhenRemoteRecordIsStale(t *testing.T) {
	// The remote record is stale: it was created as provisioning and the daemon's
	// PATCH (updateRemoteWorkspaceRecord) never landed, so the API still reports
	// `provisioning` with an empty path even though the local create finalized.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/orgs/org-1/projects" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"projects":[{"id":"project-1","organizationId":"org-1","name":"repo-1","sourceType":"git","repoProvider":"github","repoUrl":"https://example.com/repo-1.git","repoKey":"owner/repo-1","icon":"folder","color":"#1E66F5","contextEnabled":true,"createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z","workspaces":[{"id":"workspace-1","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-1","kind":"worktree","status":"provisioning","branch":"feature-a","sourceBranch":"main","localPath":"","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z"}]}]}`))
	}))
	defer server.Close()

	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := newTestService(t, runtime)

	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.setTestDatabase(database)

	// The local create finalized: the daemon row is active with a real path
	// (finalizePersistedWorkspace runs before the remote PATCH is attempted).
	store := localdb.NewWorkspaceStore(database)
	if err := store.Create(context.Background(), &localdb.Workspace{
		ID:             "workspace-1",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		NodeID:         "node-1",
		Kind:           string(workspace.KindWorktree),
		Status:         "active",
		Branch:         strPtr("feature-a"),
		SourceBranch:   strPtr("main"),
		LocalPath:      "/tmp/repo-1/.worktrees/feature-a",
		State:          string(workspace.StateActive),
	}); err != nil {
		t.Fatalf("create local workspace: %v", err)
	}

	results, err := handler.listRemoteWithWorkspaces(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("listRemoteWithWorkspaces: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 project, got %d", len(results))
	}
	workspaces := results[0].Workspaces
	if len(workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(workspaces))
	}
	record := workspaces[0]
	if record.Status != "active" {
		t.Errorf("expected overlaid status %q, got %q", "active", record.Status)
	}
	if record.LocalPath != "/tmp/repo-1/.worktrees/feature-a" {
		t.Errorf("expected overlaid local path, got %q", record.LocalPath)
	}
}

func TestListWithWorkspaces_KeepsRemoteStatusForUnknownLocalRows(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"projects":[{"id":"project-1","organizationId":"org-1","name":"repo-1","sourceType":"git","repoProvider":"github","repoUrl":"https://example.com/repo-1.git","repoKey":"owner/repo-1","icon":"folder","color":"#1E66F5","contextEnabled":true,"createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z","workspaces":[{"id":"workspace-remote","organizationId":"org-1","projectId":"project-1","userId":"user-1","nodeId":"node-2","kind":"worktree","status":"provisioning","branch":"feature-b","sourceBranch":"main","localPath":"","createdAt":"2026-08-01T00:00:00.000Z","updatedAt":"2026-08-01T00:00:00.000Z"}]}]}`))
	}))
	defer server.Close()

	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "test-token"}})
	handler := newTestService(t, runtime)

	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	handler.setTestDatabase(database)

	results, err := handler.listRemoteWithWorkspaces(context.Background(), "org-1")
	if err != nil {
		t.Fatalf("listRemoteWithWorkspaces: %v", err)
	}
	workspaces := results[0].Workspaces
	if len(workspaces) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(workspaces))
	}
	if workspaces[0].Status != "provisioning" {
		t.Errorf("expected remote status %q to pass through, got %q", "provisioning", workspaces[0].Status)
	}
}
