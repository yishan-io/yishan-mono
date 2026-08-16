package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
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
