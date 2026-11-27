package workspace

import (
	"context"
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

func TestWorkspaceListPullRequests_ReturnsRecordedHistoryNewestFirst(t *testing.T) {
	s, store := newFolderHandler(t)
	s.deps.Store = sqlite.NewStore(store)
	if err := store.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "closed", LocalPath: t.TempDir(), State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	title, metadata, resolvedAt := "Older PR", `{"number":7}`, "2026-07-02T00:00:00Z"
	seed := []sqlite.WorkspacePullRequest{
		{WorkspaceID: "workspace-1", OrganizationID: "org-1", PRID: "7", State: "merged", Title: &title,
			Metadata: &metadata, DetectedAt: "2026-07-01T00:00:00Z", ResolvedAt: &resolvedAt},
		{WorkspaceID: "workspace-1", OrganizationID: "org-1", PRID: "9", State: "open", DetectedAt: "2026-07-03T00:00:00Z"},
	}
	for index := range seed {
		if err := store.UpsertPR(context.Background(), &seed[index]); err != nil {
			t.Fatalf("seed pull request: %v", err)
		}
	}

	params, err := json.Marshal(rpc.WorkspaceListPullRequestsParams{WorkspaceID: " workspace-1 "})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceListPullRequests, params)
	if err != nil {
		t.Fatalf("list pull requests: %v", err)
	}
	records := result.(rpc.WorkspaceListPullRequestsResult).PullRequests
	if len(records) != 2 || records[0].PRID != "9" || records[1].PRID != "7" {
		t.Fatalf("expected PRs 9 then 7, got %#v", records)
	}
	older := records[1]
	if older.State != "merged" || *older.Title != "Older PR" || *older.Metadata != metadata || *older.ResolvedAt != resolvedAt {
		t.Fatalf("unexpected older record %#v", older)
	}
}

func TestWorkspaceListPullRequests_EmptyHistoryIsAnEmptyList(t *testing.T) {
	s, store := newFolderHandler(t)
	s.deps.Store = sqlite.NewStore(store)
	params, err := json.Marshal(rpc.WorkspaceListPullRequestsParams{WorkspaceID: "workspace-unknown"})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	result, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceListPullRequests, params)
	if err != nil {
		t.Fatalf("list pull requests: %v", err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if string(encoded) != `{"pullRequests":[]}` {
		t.Fatalf("expected an empty JSON list, got %s", encoded)
	}
}

func TestWorkspaceListPullRequests_RequiresWorkspaceID(t *testing.T) {
	s, store := newFolderHandler(t)
	s.deps.Store = sqlite.NewStore(store)
	params, err := json.Marshal(rpc.WorkspaceListPullRequestsParams{WorkspaceID: "  "})
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	if _, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceListPullRequests, params); err == nil {
		t.Fatal("expected a blank workspaceId to be rejected")
	}
}
