package cloud

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestCreateWorkspace_OmitsEmptyLocalPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/orgs/org-1/projects/proj-1/workspaces" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}

		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if _, exists := body["localPath"]; exists {
			t.Fatalf("expected localPath to be omitted, got %#v", body["localPath"])
		}
		if body["kind"] != "worktree" {
			t.Fatalf("expected kind=worktree, got %#v", body["kind"])
		}

		_, _ = w.Write([]byte(`{"workspace":{"id":"ws-1"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	_, err := client.CreateWorkspace("org-1", "proj-1", CreateWorkspaceInput{
		ID:           "ws-1",
		NodeID:       "node-1",
		LocalPath:    "",
		Kind:         "worktree",
		Branch:       "feature-a",
		SourceBranch: "main",
	})
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
}

func TestWorkspaceMutations_IncludeSourceNodeIDWhenProvided(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if body["sourceNodeId"] != "node-local" {
			t.Fatalf("expected sourceNodeId=node-local, got %#v", body["sourceNodeId"])
		}
		_, _ = w.Write([]byte(`{"workspace":{"id":"ws-1"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "", "", "", "", nil)
	if _, err := client.CreateWorkspace("org-1", "proj-1", CreateWorkspaceInput{Kind: "worktree", NodeID: "node-1", SourceNodeID: "node-local"}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if _, err := client.UpdateWorkspace("org-1", "proj-1", UpdateWorkspaceInput{WorkspaceID: "ws-1", LocalPath: "/tmp/ws-1", SourceNodeID: "node-local"}); err != nil {
		t.Fatalf("UpdateWorkspace: %v", err)
	}
	if _, err := client.CloseWorkspace("org-1", "proj-1", CloseWorkspaceInput{WorkspaceID: "ws-1", SourceNodeID: "node-local"}); err != nil {
		t.Fatalf("CloseWorkspace: %v", err)
	}
}

func TestCreateWorkspaceInput_FullRegistration(t *testing.T) {
	input := BuildCreateWorkspaceInput(application.Registration{
		ID: "ws-1", NodeID: "node-1", OrganizationID: "org-1", ProjectID: "project-1",
		Kind: workspace.KindWorktree, Branch: "feature/x", SourceBranch: "main",
	}, "source-node")

	if input.ID != "ws-1" || input.NodeID != "node-1" || input.Kind != "worktree" ||
		input.Branch != "feature/x" || input.SourceBranch != "main" || input.SourceNodeID != "source-node" {
		t.Fatalf("input = %#v", input)
	}
}

func TestCreateWorkspaceInput_EmptyOptionalFields(t *testing.T) {
	input := BuildCreateWorkspaceInput(application.Registration{ID: "ws-2", Kind: workspace.KindWorktree}, "source-node")
	if input.Branch != "" || input.SourceBranch != "" || input.NodeID != "" {
		t.Fatalf("optional fields must be empty strings, got %#v", input)
	}
	if input.Kind != "worktree" {
		t.Fatalf("kind = %q, want worktree", input.Kind)
	}
}

func TestUpdateWorkspaceInput_MapsPathAndSourceNode(t *testing.T) {
	input := BuildUpdateWorkspaceInput(application.Registration{ID: "ws-3"}, "/tmp/ws-3", "source-node")
	if input.WorkspaceID != "ws-3" || input.LocalPath != "/tmp/ws-3" || input.SourceNodeID != "source-node" {
		t.Fatalf("input = %#v", input)
	}
}

func TestCloseWorkspaceInput_StatusIsTyped(t *testing.T) {
	closing := BuildCloseWorkspaceInput("ws-4", "source-node", workspace.StatusClosing)
	if closing.WorkspaceID != "ws-4" || closing.Status != "closing" || closing.SourceNodeID != "source-node" {
		t.Fatalf("closing input = %#v", closing)
	}
	closed := BuildCloseWorkspaceInput("ws-4", "source-node", workspace.StatusClosed)
	if closed.Status != "closed" {
		t.Fatalf("closed input status = %q, want closed", closed.Status)
	}
}
