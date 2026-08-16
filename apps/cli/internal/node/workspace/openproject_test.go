package workspace

import (
	"context"
	"encoding/json"
	"testing"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestWorkspaceOpenProject_Success(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "ws-1", WorktreePath: dir, ProjectID: "proj-1", OrgID: "org-1"},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result, ok := raw.(rpc.WorkspaceOpenProjectResult)
	if !ok {
		t.Fatalf("unexpected result type %T", raw)
	}
	if len(result.Opened) != 1 || result.Opened[0] != "ws-1" {
		t.Errorf("expected opened=[ws-1], got %v", result.Opened)
	}
	if len(result.Skipped) != 0 {
		t.Errorf("expected no skipped, got %v", result.Skipped)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}

	// Workspace must be in manager now.
	if _, err := s.GetWorkspace("ws-1"); err != nil {
		t.Errorf("workspace ws-1 should be in manager after openProject: %v", err)
	}

	if collector.recoverySinceByAgent[recoveryProbeAgentKind] == 0 {
		t.Fatalf("expected recovery scan to be requested for opened workspace")
	}
	if !collector.needsRerun[recoveryProbeAgentKind] {
		t.Fatalf("expected recovery scan to mark in-flight agent for rerun")
	}
}

// TestHandleWorkspaceOpenProject_Idempotent verifies that calling openProject
// for a workspace already in the manager skips it when metadata already matches.

func TestWorkspaceOpenProject_Idempotent(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	// Pre-open the workspace directly in the manager with matching metadata.
	if _, err := s.Open(workspace.OpenRequest{ID: "ws-2", Path: dir, ProjectID: "proj-2", OrgID: "org-2"}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "ws-2", WorktreePath: dir, ProjectID: "proj-2", OrgID: "org-2"},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
	if len(result.Opened) != 0 {
		t.Errorf("expected no opened, got %v", result.Opened)
	}
	if len(result.Skipped) != 1 || result.Skipped[0] != "ws-2" {
		t.Errorf("expected skipped=[ws-2], got %v", result.Skipped)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
	if collector.recoverySinceByAgent[recoveryProbeAgentKind] != 0 {
		t.Fatalf("expected no recovery scan request for pure skip")
	}
}

func TestWorkspaceOpenProject_ReconcilesMissingMetadata(t *testing.T) {
	dir := t.TempDir()
	s := newTestHandler(t)
	recoveryProbeAgentKind, collector := installTokenUsageRecoveryProbe(t, s)

	if _, err := s.Open(workspace.OpenRequest{ID: "ws-3", Path: dir}); err != nil {
		t.Fatalf("pre-open: %v", err)
	}

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{{
			WorkspaceID:  "ws-3",
			WorktreePath: dir,
			ProjectID:    "proj-3",
			OrgID:        "org-3",
		}},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
	if len(result.Opened) != 1 || result.Opened[0] != "ws-3" {
		t.Fatalf("expected opened=[ws-3], got %v", result.Opened)
	}
	if len(result.Skipped) != 0 {
		t.Fatalf("expected no skipped entries, got %v", result.Skipped)
	}

	repairedWorkspace, err := s.GetWorkspace("ws-3")
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if repairedWorkspace.ProjectID != "proj-3" {
		t.Fatalf("expected repaired project id %q, got %q", "proj-3", repairedWorkspace.ProjectID)
	}
	if repairedWorkspace.OrgID != "org-3" {
		t.Fatalf("expected repaired org id %q, got %q", "org-3", repairedWorkspace.OrgID)
	}

	if collector.recoverySinceByAgent[recoveryProbeAgentKind] == 0 {
		t.Fatalf("expected recovery scan to be requested after metadata reconciliation")
	}
	if !collector.needsRerun[recoveryProbeAgentKind] {
		t.Fatalf("expected recovery scan to mark in-flight agent for rerun after metadata reconciliation")
	}
}

// TestHandleWorkspaceOpenProject_MissingFields verifies that entries with
// empty workspaceId or worktreePath produce error entries, not panics.

func TestWorkspaceOpenProject_MissingFields(t *testing.T) {
	s := newTestHandler(t)

	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{
		Workspaces: []rpc.WorkspaceOpenProjectEntry{
			{WorkspaceID: "", WorktreePath: ""},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceOpenProject: %v", err)
	}

	result := raw.(rpc.WorkspaceOpenProjectResult)
	if len(result.Errors) != 1 {
		t.Errorf("expected 1 error entry, got %v", result.Errors)
	}
	if len(result.Opened) != 0 {
		t.Errorf("expected no opened entries, got %v", result.Opened)
	}
}

// TestHandleWorkspaceCloseProject verifies that the handler stops terminals
// for each listed workspace ID and returns the stopped list.

func TestWorkspaceCloseProject(t *testing.T) {
	s := newTestHandler(t)

	params, err := json.Marshal(rpc.WorkspaceCloseProjectParams{
		WorkspaceIDs: []string{"ws-a", "ws-b", ""},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceCloseProject, params)
	if err != nil {
		t.Fatalf("handleWorkspaceCloseProject: %v", err)
	}

	result := raw.(rpc.WorkspaceCloseProjectResult)
	// Empty string entry must be filtered out.
	if len(result.Stopped) != 2 {
		t.Errorf("expected 2 stopped entries (empty string filtered), got %v", result.Stopped)
	}
	if result.Stopped[0] != "ws-a" || result.Stopped[1] != "ws-b" {
		t.Errorf("unexpected stopped order: %v", result.Stopped)
	}
}
