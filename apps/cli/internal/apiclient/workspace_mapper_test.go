package apiclient

import (
	"testing"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/workspace"
)

func TestWorkspaceToDomain_MapsLifecycleFields(t *testing.T) {
	record := WorkspaceToDomain(api.Workspace{
		ID:             "ws-1",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		UserID:         "user-1",
		NodeID:         "node-1",
		Kind:           "worktree",
		Status:         "provisioning",
		Branch:         "feature/x",
		SourceBranch:   "main",
		LocalPath:      "/tmp/ws-1",
		CreatedAt:      "2026-08-15T00:00:00.000Z",
		UpdatedAt:      "2026-08-15T00:00:00.000Z",
	})

	want := workspace.Record{
		ID:        "ws-1",
		ProjectID: "project-1",
		NodeID:    "node-1",
		Kind:      workspace.KindWorktree,
		Status:    workspace.StatusProvisioning,
		Branch:    "feature/x",
		LocalPath: "/tmp/ws-1",
	}
	if record != want {
		t.Fatalf("record = %#v, want %#v", record, want)
	}
}

func TestWorkspaceToDomain_EmptyAndOptionalFields(t *testing.T) {
	record := WorkspaceToDomain(api.Workspace{ID: "ws-2"})
	if record.ID != "ws-2" || record.Kind != workspace.Kind("") || record.Status != workspace.Status("") {
		t.Fatalf("record = %#v, want id only with empty kind/status", record)
	}
	if record.Branch != "" || record.NodeID != "" || record.ProjectID != "" {
		t.Fatalf("record = %#v, want empty optional fields", record)
	}
}

func TestWorkspaceToDomain_KindAndStatusAreTyped(t *testing.T) {
	// The mapper is the boundary that converts string DTO fields into the
	// typed domain values used by application code (no string literals there).
	record := WorkspaceToDomain(api.Workspace{Kind: "folder", Status: "closed", ID: "ws-3"})
	if record.Kind != workspace.KindFolder || record.Status != workspace.StatusClosed {
		t.Fatalf("record = %#v, want folder/closed typed values", record)
	}
}
