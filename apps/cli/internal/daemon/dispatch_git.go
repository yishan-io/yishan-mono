package daemon

import (
	"context"
	"encoding/json"

	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchGit(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodGitStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitStatus(ctx, req.WorkspaceID)
	case MethodGitInspect:
		var req gitInspectParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitInspect(ctx, req.Path)
	case MethodGitListChanges:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListChanges(ctx, req.WorkspaceID)
	case MethodGitTrack:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitTrackChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"tracked": true}, nil
	case MethodGitUnstage:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitUnstageChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"unstaged": true}, nil
	case MethodGitRevert:
		var req gitPathsParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRevertChanges(ctx, req.WorkspaceID, req.Paths); err != nil {
			return nil, err
		}
		return map[string]bool{"reverted": true}, nil
	case MethodGitCommit:
		var req gitCommitParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitCommitChanges(ctx, req.WorkspaceID, req.Message, req.Amend, req.Signoff)
	case MethodGitBranchStatus:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitBranchStatus(ctx, req.WorkspaceID)
	case MethodGitBranchPullRequest:
		var req gitBranchPullRequestParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitBranchPullRequest(ctx, req.WorkspaceID, req.Branch)
	case MethodGitCommitsToTarget:
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListCommitsToTarget(ctx, req.WorkspaceID, req.TargetBranch)
	case MethodGitBranchDiffSummary:
		var req gitTargetBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitBranchDiffSummary(ctx, req.WorkspaceID, req.TargetBranch)
	case MethodGitCommitDiff:
		var req gitCommitDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadCommitDiff(ctx, req.WorkspaceID, req.CommitHash, req.Path)
	case MethodGitBranchDiff:
		var req gitBranchDiffParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitReadBranchComparisonDiff(ctx, req.WorkspaceID, req.TargetBranch, req.Path)
	case MethodGitBranches:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitListBranches(ctx, req.WorkspaceID)
	case MethodGitPush:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPushBranch(ctx, req.WorkspaceID)
	case MethodGitPublish:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitPublishBranch(ctx, req.WorkspaceID)
	case MethodGitRenameBranch:
		var req gitRenameBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRenameBranch(ctx, req.WorkspaceID, req.NextBranch); err != nil {
			return nil, err
		}
		return map[string]bool{"renamed": true}, nil
	case MethodGitRemoveBranch:
		var req gitRemoveBranchParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveBranch(ctx, req.WorkspaceID, req.Branch, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitPrMerge:
		var req gitPrMergeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		out, err := h.manager.GitPrMerge(ctx, req.WorkspaceID, req.PrNumber, req.Method, req.DeleteBranch)
		if err != nil {
			return nil, err
		}
		return map[string]string{"output": out}, nil
	case MethodGitPrClose:
		var req gitPrCloseParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		out, err := h.manager.GitPrClose(ctx, req.WorkspaceID, req.PrNumber)
		if err != nil {
			return nil, err
		}
		return map[string]string{"output": out}, nil
	case MethodGitWorktreeCreate:
		var req gitCreateWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitCreateWorktree(ctx, req.WorkspaceID, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
			return nil, err
		}
		return map[string]bool{"created": true}, nil
	case MethodGitWorktreeRemove:
		var req gitRemoveWorktreeParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		if err := h.manager.GitRemoveWorktree(ctx, req.WorkspaceID, req.WorktreePath, req.Force); err != nil {
			return nil, err
		}
		return map[string]bool{"removed": true}, nil
	case MethodGitAuthorName:
		var req gitStatusParams
		if err := decodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.manager.GitAuthorName(ctx, req.WorkspaceID)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, "unknown git method: "+method)
	}
}
