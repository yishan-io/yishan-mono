package cloud

import (
	"testing"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

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
