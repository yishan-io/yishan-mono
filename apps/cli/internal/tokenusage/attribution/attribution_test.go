package attribution

import (
	"testing"

	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"

	"yishan/apps/cli/internal/files"
)

func TestResolveWorktree_ExactPrefixAndUnknown(t *testing.T) {
	worktrees := []record.WorktreeRef{
		{ProjectID: "proj-1", WorkspaceID: "ws-1", WorkspacePath: "/home/u/proj-a"},
		{ProjectID: "proj-2", WorkspaceID: "ws-2", WorkspacePath: "/home/u/proj-b"},
	}

	ws, confidence := ResolveWorktree("/home/u/proj-a", worktrees)
	if ws.WorkspaceID != "ws-1" || confidence != record.AttributionExact {
		t.Fatalf("exact match = %+v confidence %q, want ws-1/exact", ws, confidence)
	}

	ws, confidence = ResolveWorktree("/home/u/proj-a/sub/dir", worktrees)
	if ws.WorkspaceID != "ws-1" || confidence != record.AttributionPrefixMatch {
		t.Fatalf("prefix match = %+v confidence %q, want ws-1/prefix_match", ws, confidence)
	}

	ws, confidence = ResolveWorktree("/home/u/other", worktrees)
	if ws.WorkspaceID != "unknown" || confidence != record.AttributionFallbackUnknown {
		t.Fatalf("unknown match = %+v confidence %q, want unknown/fallback_unknown", ws, confidence)
	}

	ws, confidence = ResolveWorktree("", worktrees)
	if ws.WorkspaceID != "unknown" || confidence != record.AttributionFallbackUnknown {
		t.Fatalf("empty cwd = %+v confidence %q, want unknown/fallback_unknown", ws, confidence)
	}
}

// TestEnrichFromRegistry_DuplicateAndPartialInput covers the collection
// data-flow exit criteria: duplicate records for the same workspace are each
// enriched (the DB replace is the dedup mechanism), and records attributed to
// the literal unknown workspace are dropped (partial/unattributable input).
func TestEnrichFromRegistry_DuplicateAndPartialInput(t *testing.T) {
	registry := instance.NewRegistry(files.NewFileService())
	registry.Open(workspace.Workspace{ID: "ws-1", Path: "/work/ws-1", OrgID: "org-1", ProjectID: "proj-1", State: workspace.StateActive})

	rows := []record.UsageRecord{
		// Duplicate input: two rows for the same open workspace.
		{WorkspaceID: "ws-1", ProjectID: "", WorkspacePath: "", OrganizationID: ""},
		{WorkspaceID: "ws-1", ProjectID: "proj-1", WorkspacePath: "/work/ws-1", OrganizationID: ""},
		// Partial/unattributable input: literal unknown workspace id.
		{WorkspaceID: "unknown", ProjectID: "proj-1", WorkspacePath: "/work/ws-1"},
	}

	enriched := EnrichFromRegistry(rows, registry)

	if len(enriched) != 2 {
		t.Fatalf("expected 2 enriched rows (unknown dropped), got %d: %+v", len(enriched), enriched)
	}
	for _, row := range enriched {
		if row.WorkspaceID == "unknown" {
			t.Fatalf("expected unknown-workspace row dropped, got %+v", row)
		}
		if row.OrganizationID != "org-1" {
			t.Fatalf("expected org enrichment org-1, got %q", row.OrganizationID)
		}
		if row.ProjectID != "proj-1" || row.WorkspacePath != "/work/ws-1" {
			t.Fatalf("expected project/path enrichment, got %+v", row)
		}
	}
}
