package daemon

import (
	"context"

	"yishan/apps/cli/internal/rpc"
)

// GitService implementation: each method resolves the workspace handle and
// performs one git operation.

func (h *JSONRPCHandler) GitStatus(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitStatus(ctx)
}

func (h *JSONRPCHandler) GitInspect(ctx context.Context, req rpc.GitInspectParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitInspect(ctx)
}

func (h *JSONRPCHandler) GitInspectPath(ctx context.Context, req rpc.GitInspectPathParams) (any, error) {
	return h.manager.GitInspect(ctx, req.Path)
}

func (h *JSONRPCHandler) GitListChanges(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListChanges(ctx)
}

func (h *JSONRPCHandler) GitTrack(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitTrackChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"tracked": true}, nil
}

func (h *JSONRPCHandler) GitUnstage(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitUnstageChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"unstaged": true}, nil
}

func (h *JSONRPCHandler) GitRevert(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRevertChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"reverted": true}, nil
}

func (h *JSONRPCHandler) GitCommit(ctx context.Context, req rpc.GitCommitParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitCommitChanges(ctx, req.Message, req.Amend, req.Signoff)
}

func (h *JSONRPCHandler) GitBranchStatus(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchStatus(ctx)
}

func (h *JSONRPCHandler) GitBranchPullRequest(ctx context.Context, req rpc.GitBranchPullRequestParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchPullRequest(ctx, req.Branch)
}

func (h *JSONRPCHandler) GitCommitsToTarget(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListCommitsToTarget(ctx, req.TargetBranch)
}

func (h *JSONRPCHandler) GitBranchDiffSummary(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchDiffSummary(ctx, req.TargetBranch)
}

func (h *JSONRPCHandler) GitCommitDiff(ctx context.Context, req rpc.GitCommitDiffParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadCommitDiff(ctx, req.CommitHash, req.Path)
}

func (h *JSONRPCHandler) GitBranchDiff(ctx context.Context, req rpc.GitBranchDiffParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadBranchComparisonDiff(ctx, req.TargetBranch, req.Path)
}

func (h *JSONRPCHandler) GitBranches(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListBranches(ctx)
}

func (h *JSONRPCHandler) GitPush(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPushBranch(ctx)
}

func (h *JSONRPCHandler) GitPublish(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPublishBranch(ctx)
}

func (h *JSONRPCHandler) GitRenameBranch(ctx context.Context, req rpc.GitRenameBranchParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRenameBranch(ctx, req.NextBranch); err != nil {
		return nil, err
	}
	return map[string]bool{"renamed": true}, nil
}

func (h *JSONRPCHandler) GitRemoveBranch(ctx context.Context, req rpc.GitRemoveBranchParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveBranch(ctx, req.Branch, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (h *JSONRPCHandler) GitPrMerge(ctx context.Context, req rpc.GitPrMergeParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrMerge(ctx, req.PrNumber, req.Method, req.DeleteBranch)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (h *JSONRPCHandler) GitPrClose(ctx context.Context, req rpc.GitPrCloseParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrClose(ctx, req.PrNumber)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (h *JSONRPCHandler) GitWorktreeCreate(ctx context.Context, req rpc.GitCreateWorktreeParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitCreateWorktree(ctx, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
		return nil, err
	}
	return map[string]bool{"created": true}, nil
}

func (h *JSONRPCHandler) GitWorktreeRemove(ctx context.Context, req rpc.GitRemoveWorktreeParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveWorktree(ctx, req.WorktreePath, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (h *JSONRPCHandler) GitAuthorName(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := h.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitAuthorName(ctx)
}
