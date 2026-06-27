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

func newWorkspaceCreateFlowTestHandler(t *testing.T, baseURL string) *JSONRPCHandler {
	t.Helper()
	runtime := cliruntime.New(&config.Config{API: config.APIConfig{BaseURL: baseURL, Token: "test-token"}})
	handler := NewJSONRPCHandler(workspace.NewManager(), runtime, "node-local", filepath.Join(t.TempDir(), "daemon.log"), nil, nil, filepath.Join(t.TempDir(), "config.yml"), NewAppContextStore(""))
	t.Cleanup(func() { handler.Shutdown() })
	return handler
}
