package daemon

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/config"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
)

func TestPrepareWorkspaceCreate_RejectsPrimaryWorkspaceCreate(t *testing.T) {
	handler := newWorkspaceCreateFlowTestHandler(t, "http://unused")
	_, err := handler.prepareWorkspaceCreate(context.Background(), workspaceCreateParams{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           workspace.KindPrimary,
	})
	want := "workspace create only supports worktree workspaces; create a new project to create a primary workspace"
	if err == nil || err.Error() != want {
		t.Fatalf("err = %v, want %q", err, want)
	}
}

func TestPrepareWorktreeWorkspaceCreate_UsesPrimaryWorkspacePath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/orgs/org-1/projects":
			_, _ = w.Write([]byte(`{"projects":[{"id":"proj-1","repoUrl":"https://example.com/repo.git","repoKey":"acme/repo","contextEnabled":true,"setupScript":"npm install"}]}`))
		case "/orgs/org-1/projects/proj-1/workspaces":
			_, _ = w.Write([]byte(`{"workspaces":[{"id":"ws-primary","projectId":"proj-1","nodeId":"node-local","kind":"primary","localPath":"/tmp/primary-repo"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	handler := newWorkspaceCreateFlowTestHandler(t, server.URL)
	plan, err := handler.prepareWorkspaceCreate(context.Background(), workspaceCreateParams{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           workspace.KindWorktree,
		Branch:         "feature/test",
		SourceBranch:   "main",
	})
	if err != nil {
		t.Fatalf("prepareWorkspaceCreate: %v", err)
	}
	if plan.localCreate == nil {
		t.Fatal("localCreate = nil, want local worktree plan")
	}
	if plan.remoteRequest != nil {
		t.Fatalf("remoteRequest = %#v, want nil", plan.remoteRequest)
	}
	if plan.localCreate.SourcePath != "/tmp/primary-repo" {
		t.Fatalf("SourcePath = %q, want %q", plan.localCreate.SourcePath, "/tmp/primary-repo")
	}
	if plan.localCreate.RepoKey != "acme/repo" {
		t.Fatalf("RepoKey = %q, want %q", plan.localCreate.RepoKey, "acme/repo")
	}
	if plan.localCreate.SetupHook != "npm install" {
		t.Fatalf("SetupHook = %q, want %q", plan.localCreate.SetupHook, "npm install")
	}
}

func TestPrepareWorktreeWorkspaceCreate_RemoteNodeReturnsRelayRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/orgs/org-1/nodes":
			_, _ = w.Write([]byte(`{"nodes":[{"id":"node-remote"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	handler := newWorkspaceCreateFlowTestHandler(t, server.URL)
	plan, err := handler.prepareWorkspaceCreate(context.Background(), workspaceCreateParams{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		Kind:           workspace.KindWorktree,
		Branch:         "feature/test",
		SourceBranch:   "main",
		NodeID:         "node-remote",
	})
	if err != nil {
		t.Fatalf("prepareWorkspaceCreate: %v", err)
	}
	if plan.remoteRequest == nil {
		t.Fatal("remoteRequest = nil, want remote relay plan")
	}
	if plan.localCreate != nil {
		t.Fatalf("localCreate = %#v, want nil", plan.localCreate)
	}
	if plan.remoteRequest.NodeID != "node-remote" {
		t.Fatalf("NodeID = %q, want %q", plan.remoteRequest.NodeID, "node-remote")
	}
	if plan.remoteRequest.ReplyNodeID != "node-local" {
		t.Fatalf("ReplyNodeID = %q, want %q", plan.remoteRequest.ReplyNodeID, "node-local")
	}
}

func TestPrepareDirectWorkspaceCreate_SetsRegistrationWithFallbackNodeID(t *testing.T) {
	handler := newWorkspaceCreateFlowTestHandler(t, "http://unused")
	plan, err := handler.prepareWorkspaceCreate(context.Background(), workspaceCreateParams{
		OrganizationID: "org-1",
		ProjectID:      "proj-1",
		// direct path: sourcePath + repoKey + targetBranch all present
		SourcePath:   "/tmp/primary-repo",
		RepoKey:      "acme/repo",
		TargetBranch: "feature/test",
		SourceBranch: "main",
		// nodeId intentionally omitted — daemon should fill in its own nodeID
	})
	if err != nil {
		t.Fatalf("prepareWorkspaceCreate: %v", err)
	}
	if plan.localCreate == nil {
		t.Fatal("localCreate = nil, want direct local plan")
	}
	if plan.registration == nil {
		t.Fatal("registration = nil, want API registration to be set for direct create path")
	}
	if plan.registration.NodeID != "node-local" {
		t.Fatalf("registration.NodeID = %q, want %q", plan.registration.NodeID, "node-local")
	}
	if plan.registration.OrganizationID != "org-1" {
		t.Fatalf("registration.OrganizationID = %q, want %q", plan.registration.OrganizationID, "org-1")
	}
	if plan.registration.Branch != "feature/test" {
		t.Fatalf("registration.Branch = %q, want %q", plan.registration.Branch, "feature/test")
	}
}

func TestPrepareDirectWorkspaceCreate_SkipsRegistrationWhenOrgMissing(t *testing.T) {
	handler := newWorkspaceCreateFlowTestHandler(t, "http://unused")
	plan, err := handler.prepareWorkspaceCreate(context.Background(), workspaceCreateParams{
		// no organizationId — registration should be nil (offline/unauthenticated use)
		SourcePath:   "/tmp/primary-repo",
		RepoKey:      "acme/repo",
		TargetBranch: "feature/test",
		SourceBranch: "main",
	})
	if err != nil {
		t.Fatalf("prepareWorkspaceCreate: %v", err)
	}
	if plan.localCreate == nil {
		t.Fatal("localCreate = nil")
	}
	if plan.registration != nil {
		t.Fatalf("registration = %#v, want nil when org is missing", plan.registration)
	}
}

func newWorkspaceCreateFlowTestHandler(t *testing.T, baseURL string) *JSONRPCHandler {
	t.Helper()
	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: baseURL, Token: "test-token"}})
	handler := NewJSONRPCHandler(workspace.NewManager(), runtime, "node-local", filepath.Join(t.TempDir(), "daemon.log"), nil, nil, filepath.Join(t.TempDir(), "config.yml"), NewAppContextStore(""))
	t.Cleanup(func() { handler.Shutdown() })
	return handler
}
