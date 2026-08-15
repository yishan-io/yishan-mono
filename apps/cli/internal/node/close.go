package node

import (
	"context"
	"fmt"
	"os"

	"yishan/apps/cli/internal/worktree"
	"yishan/apps/cli/internal/workspace"
)

// CloseWorkspace closes a workspace: it stops its terminals, tears down the
// worktree (via the worktree package), and removes the runtime instance.
func (a *App) CloseWorkspace(ctx context.Context, req workspace.CloseRequest) (workspace.CloseResult, error) {
	ws, err := a.registryWorkspace(req.WorkspaceID)
	if err != nil {
		return workspace.CloseResult{}, err
	}

	var result workspace.CloseResult

	cleanupErrors := a.Terminals.StopAllForWorkspace(req.WorkspaceID)
	if len(cleanupErrors) > 0 {
		messages := make([]string, len(cleanupErrors))
		for i, e := range cleanupErrors {
			messages[i] = e.Error()
		}
		result.TerminalCleanupErrors = messages
	}

	result, err = a.CloseWorkspacePath(ctx, workspace.ClosePathRequest{
		WorkspaceID:   req.WorkspaceID,
		Path:          ws.Path,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
		PostHook:      req.PostHook,
	})
	if err != nil {
		return result, err
	}

	a.Registry.Remove(req.WorkspaceID)

	return result, nil
}

func (a *App) registryWorkspace(id string) (workspace.Workspace, error) {
	ws, ok := a.Registry.Get(id)
	if !ok {
		return workspace.Workspace{}, workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	return ws, nil
}

// CloseWorkspacePath runs the post hook and tears down the worktree (and
// optionally its branch) via the worktree package. A directory that lost its
// git registration is treated as already gone (the leftover directory is
// deliberately not removed).
func (a *App) CloseWorkspacePath(ctx context.Context, req workspace.ClosePathRequest) (workspace.CloseResult, error) {
	var result workspace.CloseResult

	if info, statErr := os.Stat(req.Path); statErr != nil {
		if os.IsNotExist(statErr) {
			return result, nil
		}
		return result, statErr
	} else if !info.IsDir() {
		// Path exists but is not a directory (e.g. the worktree was replaced
		// by a regular file): nothing to clean up.
		return result, nil
	}

	// Run the post hook before tearing down the workspace so the hook can
	// still access workspace files and git state. Hook failures are
	// non-fatal: the close operation always proceeds.
	hookResult, hookErr := workspace.RunHook(ctx, workspace.HookRequest{
		Command:       req.PostHook,
		WorkspaceID:   req.WorkspaceID,
		WorkspacePath: req.Path,
		HookName:      "post",
	})
	if hookErr != nil {
		hookResult.Error = fmt.Sprintf("post hook: %v", hookErr)
		result.PostHookResult = &hookResult
	} else if !hookResult.Skipped {
		result.PostHookResult = &hookResult
	}

	if err := worktree.Remove(ctx, worktree.RemoveRequest{
		Path:          req.Path,
		Branch:        req.Branch,
		RemoveBranch:  req.RemoveBranch,
		ForceWorktree: req.ForceWorktree,
		ForceBranch:   req.ForceBranch,
	}); err != nil {
		return result, err
	}

	return result, nil
}
