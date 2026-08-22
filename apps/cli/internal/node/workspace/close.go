package workspace

import (
	"context"
	"fmt"
	"os"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
	"yishan/apps/cli/internal/workspace/worktree"
)

// CloseLocal runs the complete close lifecycle for direct callers. The
// application close wrapper uses closeWorkspace after it has installed its
// own admission barrier, so a direct call can never remove a live Pi CWD.
func (s *Service) CloseLocal(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	result, err := s.app.CloseLocal(ctx, application.CloseCommand{
		WorkspaceID: req.WorkspaceID, Branch: req.Branch, RemoveBranch: req.RemoveBranch,
		ForceWorktree: req.ForceWorktree, ForceBranch: req.ForceBranch, PostHook: req.PostHook,
	})
	return workspace.CloseResult{WorktreeRemoved: result.Status == string(workspace.StatusClosed), PostHookResult: result.PostHookResult, TerminalCleanupErrors: result.TerminalCleanupErrors}, err
}

// closeWorkspace removes the runtime worktree after the application service
// has stopped terminal/agent admission. It is intentionally private.
func (s *Service) closeWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	ws, err := s.registryWorkspace(req.WorkspaceID)
	if err != nil {
		return workspace.CloseResult{}, err
	}
	result, err := s.ClosePath(ctx, workspace.ClosePathRequest{
		WorkspaceID: req.WorkspaceID, Path: ws.Path, Branch: req.Branch,
		RemoveBranch: req.RemoveBranch, ForceWorktree: req.ForceWorktree,
		ForceBranch: req.ForceBranch, PostHook: req.PostHook,
	})
	if result.WorktreeRemoved {
		s.deps.Registry.Remove(req.WorkspaceID)
	}
	return result, err
}

// stopWorkspaceTerminals stops terminals before agent cleanup and returns any
// failures in the RPC close result without preventing teardown.
func (s *Service) stopWorkspaceTerminals(workspaceID string) []string {
	if s.deps.Terminals == nil {
		return nil
	}
	errs := s.deps.Terminals.StopAllForWorkspace(workspaceID)
	messages := make([]string, 0, len(errs))
	for _, err := range errs {
		messages = append(messages, err.Error())
	}
	return messages
}

func (s *Service) beginAgentCleanup(ctx context.Context, workspaceID string) (any, error) {
	if s.deps.BeginAgentCleanup == nil {
		return nil, nil
	}
	return s.deps.BeginAgentCleanup(ctx, workspaceID)
}

func (s *Service) abortAgentCleanup(handle any) {
	if s.deps.AbortAgentCleanup != nil {
		s.deps.AbortAgentCleanup(handle)
	}
}

func (s *Service) commitAgentCleanup(handle any) {
	if s.deps.CommitAgentCleanup != nil {
		s.deps.CommitAgentCleanup(handle)
	}
}

func (s *Service) registryWorkspace(id string) (workspace.Workspace, error) {
	ws, ok := s.deps.Registry.Get(id)
	if !ok {
		return workspace.Workspace{}, rpc.NewRPCError(rpc.CodeNotFound, "workspace not found")
	}
	return ws, nil
}

// RetryClose completes a persisted cleanup through the workspace application
// lifecycle rather than bypassing close finalization with a raw path removal.
func (s *Service) RetryClose(ctx context.Context, cleanup application.CleanupRequest) error {
	return s.app.RetryClose(ctx, cleanup)
}

// CloseWorkspacePath runs the post hook and tears down the worktree (and
// optionally its branch) via the worktree package. A directory that lost its
// git registration is treated as already gone (the leftover directory is
// deliberately not removed).
func (s *Service) ClosePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	result, shouldRemove, err := closePathPrecheck(req)
	if err != nil || !shouldRemove {
		return result, err
	}
	return removeClosePath(ctx, req, result)
}

func closePathPrecheck(req workspace.ClosePathRequest) (workspace.CloseResult, bool, error) {
	var result workspace.CloseResult
	info, err := os.Stat(req.Path)
	if err == nil && info.IsDir() {
		return result, true, nil
	}
	if err == nil || os.IsNotExist(err) {
		result.WorktreeRemoved = true
		return result, false, nil
	}
	return result, false, err
}

func removeClosePath(ctx context.Context, req workspace.ClosePathRequest, result workspace.CloseResult) (workspace.CloseResult, error) {
	runPostCloseHook(ctx, req, &result)
	removal := worktree.RemoveRequest{
		Path: req.Path, Branch: req.Branch, RemoveBranch: req.RemoveBranch,
		ForceWorktree: req.ForceWorktree, ForceBranch: req.ForceBranch,
	}
	plan, err := worktree.PrepareRemoval(ctx, removal)
	if err != nil {
		return result, err
	}
	if err := worktree.RemovePreparedWorktree(ctx, removal, plan); err != nil {
		return result, err
	}
	result.WorktreeRemoved = true
	return result, worktree.RemovePreparedBranch(ctx, removal, plan)
}

func runPostCloseHook(ctx context.Context, req workspace.ClosePathRequest, result *workspace.CloseResult) {
	hookResult, hookErr := workspace.RunHook(ctx, workspace.HookRequest{
		Command: req.PostHook, WorkspaceID: req.WorkspaceID, WorkspacePath: req.Path, HookName: "post",
	})
	if hookErr != nil {
		hookResult.Error = fmt.Sprintf("post hook: %v", hookErr)
		result.PostHookResult = &hookResult
	} else if !hookResult.Skipped {
		result.PostHookResult = &hookResult
	}
}
