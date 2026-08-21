package workspace

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/git"
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

func TestWorkspaceOpenProject_FolderCreateThenSnapshotSkipsMetadataReconciliation(t *testing.T) {
	s, inspectionCalls := newGitInspectionProbeHandler(t)
	folderPath := t.TempDir()

	initialCreatePayload := rpc.WorkspaceOpenProjectEntry{
		WorkspaceID:  "folder-1",
		WorktreePath: folderPath,
		ProjectID:    "local-folder",
		OrgID:        "",
		Kind:         string(workspace.KindFolder),
	}
	result := callOpenProject(t, s, initialCreatePayload)
	if len(result.Opened) != 1 || result.Opened[0] != "folder-1" {
		t.Fatalf("initial folder create open = %#v, want folder-1 opened", result)
	}

	snapshotPayload := rpc.WorkspaceOpenProjectEntry{
		WorkspaceID:  "folder-1",
		WorktreePath: folderPath,
		ProjectID:    "local-folder",
		OrgID:        "org-selected",
		Kind:         string(workspace.KindFolder),
	}
	result = callOpenProject(t, s, snapshotPayload)
	if len(result.Skipped) != 1 || result.Skipped[0] != "folder-1" {
		t.Fatalf("folder snapshot reopen = %#v, want folder-1 skipped", result)
	}

	if _, err := s.RefreshPullRequest(context.Background(), workspace.RefreshPullRequestRequest{WorkspaceID: "folder-1"}); err != nil {
		t.Fatalf("RefreshPullRequest: %v", err)
	}
	if _, _, _, err := s.RefreshHealth(context.Background(), "folder-1"); err != nil {
		t.Fatalf("RefreshHealth: %v", err)
	}
	assertGitInspectionCalls(t, *inspectionCalls, 0)
}

func TestWorkspaceOpenProject_FolderSkipsGitInspection(t *testing.T) {
	s, inspectionCalls := newGitInspectionProbeHandler(t)
	folderPath := t.TempDir()

	result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{
		WorkspaceID: "folder-1", WorktreePath: folderPath, Kind: string(workspace.KindFolder),
	})
	if len(result.Opened) != 1 || result.Opened[0] != "folder-1" {
		t.Fatalf("first folder open = %#v, want folder-1 opened", result)
	}
	assertGitInspectionCalls(t, *inspectionCalls, 0)
	if s.deps.Watchers.IsWatching(folderPath) {
		t.Fatal("folder must not register a Git watcher")
	}

	registered, err := s.GetWorkspace("folder-1")
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if registered.ID != "folder-1" || registered.Kind != workspace.KindFolder {
		t.Fatalf("registered folder = %#v", registered)
	}

	result = callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{
		WorkspaceID: "folder-1", WorktreePath: folderPath, Kind: string(workspace.KindFolder),
	})
	if len(result.Skipped) != 1 || result.Skipped[0] != "folder-1" {
		t.Fatalf("idempotent folder open = %#v, want folder-1 skipped", result)
	}
	assertGitInspectionCalls(t, *inspectionCalls, 0)

	if _, err := s.RefreshPullRequest(context.Background(), workspace.RefreshPullRequestRequest{WorkspaceID: "folder-1"}); err != nil {
		t.Fatalf("RefreshPullRequest: %v", err)
	}
	assertGitInspectionCalls(t, *inspectionCalls, 0)
}

func TestWorkspaceOpenProject_FolderReplacesKindlessTrackedRuntimeEntry(t *testing.T) {
	inspectionCalls := 0
	s := newTestHandlerWithInspectResolver(t, func(context.Context, string) (git.GitInspectResult, error) {
		inspectionCalls++
		return git.GitInspectResult{
			IsGitRepository: true,
			CurrentBranch:   "feature/legacy",
			RemoteURL:       "https://github.com/acme/legacy.git",
		}, nil
	})
	folderPath := t.TempDir()
	if err := os.Mkdir(filepath.Join(folderPath, ".git"), 0o755); err != nil {
		t.Fatalf("create legacy Git directory: %v", err)
	}
	legacy, err := s.Open(workspace.OpenRequest{ID: "folder-legacy", Path: folderPath})
	if err != nil {
		t.Fatalf("pre-open kindless workspace: %v", err)
	}
	if err := s.deps.Registry.SetPullRequest(legacy.ID, &workspace.WorkspacePullRequest{Number: 42}); err != nil {
		t.Fatalf("set legacy pull request: %v", err)
	}
	s.WatchAndTrack(legacy)
	t.Cleanup(s.deps.PRTracker.Stop)
	if !s.deps.Watchers.IsWatching(legacy.Path) {
		t.Fatal("legacy workspace must register a Git watcher")
	}
	assertGitInspectionCalls(t, inspectionCalls, 1)

	result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{
		WorkspaceID: "folder-legacy", WorktreePath: folderPath, Kind: string(workspace.KindFolder),
	})
	if len(result.Opened) != 1 || result.Opened[0] != "folder-legacy" {
		t.Fatalf("folder reconciliation = %#v, want folder-legacy opened", result)
	}
	registered, err := s.GetWorkspace("folder-legacy")
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if registered.Kind != workspace.KindFolder {
		t.Fatalf("reconciled workspace kind = %q, want folder", registered.Kind)
	}
	if registered.PullRequest != nil {
		t.Fatalf("reconciled folder pull request = %#v, want nil", registered.PullRequest)
	}
	if s.deps.Watchers.IsWatching(legacy.Path) {
		t.Fatal("reconciled folder must remove the legacy Git watcher")
	}

	if _, err := s.RefreshPullRequest(context.Background(), workspace.RefreshPullRequestRequest{WorkspaceID: legacy.ID}); err != nil {
		t.Fatalf("RefreshPullRequest: %v", err)
	}
	assertGitInspectionCalls(t, inspectionCalls, 1)
}

func TestWorkspaceOpenProject_NormalWorkspaceInspectsGit(t *testing.T) {
	s, inspectionCalls := newGitInspectionProbeHandler(t)
	result := callOpenProject(t, s, rpc.WorkspaceOpenProjectEntry{
		WorkspaceID: "worktree-1", WorktreePath: t.TempDir(), Kind: string(workspace.KindWorktree),
	})
	if len(result.Opened) != 1 || result.Opened[0] != "worktree-1" {
		t.Fatalf("normal workspace open = %#v, want worktree-1 opened", result)
	}
	if *inspectionCalls == 0 {
		t.Fatal("expected normal workspace to inspect Git")
	}
}

func newGitInspectionProbeHandler(t *testing.T) (*Service, *int) {
	t.Helper()
	inspectionCalls := 0
	s := newTestHandlerWithInspectResolver(t, func(context.Context, string) (git.GitInspectResult, error) {
		inspectionCalls++
		return git.GitInspectResult{}, nil
	})
	return s, &inspectionCalls
}

func callOpenProject(t *testing.T, s *Service, entry rpc.WorkspaceOpenProjectEntry) rpc.WorkspaceOpenProjectResult {
	t.Helper()
	params, err := json.Marshal(rpc.WorkspaceOpenProjectParams{Workspaces: []rpc.WorkspaceOpenProjectEntry{entry}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	raw, err := s.callRPCForTest(context.Background(), rpc.MethodWorkspaceOpenProject, params)
	if err != nil {
		t.Fatalf("OpenProject: %v", err)
	}
	return raw.(rpc.WorkspaceOpenProjectResult)
}

func assertGitInspectionCalls(t *testing.T, got int, want int) {
	t.Helper()
	if got != want {
		t.Fatalf("Git inspection calls = %d, want %d", got, want)
	}
}
