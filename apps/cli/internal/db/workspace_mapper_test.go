package db

import (
	"testing"

	"yishan/apps/cli/internal/workspace"
)

func TestWorkspaceToDomain_MapsLifecycleFields(t *testing.T) {
	branch := "feature/x"
	record := WorkspaceToDomain(Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", Branch: &branch, SourceBranch: &branch,
		LocalPath: "/tmp/ws-1", State: "active",
	})

	want := workspace.Record{
		ID:        "ws-1",
		ProjectID: "project-1",
		NodeID:    "node-1",
		Kind:      workspace.KindWorktree,
		Status:    workspace.StatusActive,
		Branch:    "feature/x",
		LocalPath: "/tmp/ws-1",
	}
	if record != want {
		t.Fatalf("record = %#v, want %#v", record, want)
	}
}

func TestWorkspaceToDomain_NilBranchAndEmptyFields(t *testing.T) {
	record := WorkspaceToDomain(Workspace{ID: "ws-2", Kind: "folder"})
	if record.Branch != "" || record.Status != workspace.Status("") {
		t.Fatalf("record = %#v, want nil branch → empty, empty status", record)
	}
	if record.Kind != workspace.KindFolder {
		t.Fatalf("record.Kind = %q, want folder", record.Kind)
	}
}

func TestWorkspaceFromDomain_RoundTripsLifecycleFields(t *testing.T) {
	domain := workspace.Record{
		ID: "ws-3", ProjectID: "project-3", NodeID: "node-3",
		Kind: workspace.KindWorktree, Status: workspace.StatusClosing, Branch: "feature/y", LocalPath: "/tmp/ws-3",
	}
	row := WorkspaceFromDomain(domain)

	if row.ID != "ws-3" || row.ProjectID != "project-3" || row.NodeID != "node-3" ||
		row.Kind != "worktree" || row.Status != "closing" || row.LocalPath != "/tmp/ws-3" {
		t.Fatalf("row = %#v, want lifecycle fields mapped", row)
	}
	if row.Branch == nil || *row.Branch != "feature/y" {
		t.Fatalf("row.Branch = %v, want pointer to feature/y", row.Branch)
	}

	roundTripped := WorkspaceToDomain(row)
	if roundTripped != domain {
		t.Fatalf("round trip = %#v, want %#v", roundTripped, domain)
	}
}

func TestWorkspaceFromDomain_EmptyBranchBecomesNil(t *testing.T) {
	row := WorkspaceFromDomain(workspace.Record{ID: "ws-4", Kind: workspace.KindFolder})
	if row.Branch != nil {
		t.Fatalf("row.Branch = %v, want nil for empty branch", row.Branch)
	}
	if row.Kind != "folder" {
		t.Fatalf("row.Kind = %q, want folder", row.Kind)
	}
}
