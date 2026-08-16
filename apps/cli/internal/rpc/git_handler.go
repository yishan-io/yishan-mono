package rpc

import (
	"context"
	"encoding/json"
)

// GitHandler owns the git.* RPC namespace decoding.
type GitHandler struct {
	Services GitService
}

// Call implements Handler.
func (h *GitHandler) Call(ctx context.Context, connection *Connection, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodGitStatus:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Status(ctx, req)
	case MethodGitInspect:
		var req GitInspectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Inspect(ctx, req)
	case MethodGitInspectPath:
		var req GitInspectPathParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.InspectPath(ctx, req)
	case MethodGitListChanges:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.ListChanges(ctx, req)
	case MethodGitTrack:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Track(ctx, req)
	case MethodGitUnstage:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Unstage(ctx, req)
	case MethodGitRevert:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Revert(ctx, req)
	case MethodGitCommit:
		var req GitCommitParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Commit(ctx, req)
	case MethodGitBranchStatus:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.BranchStatus(ctx, req)
	case MethodGitBranchPullRequest:
		var req GitBranchPullRequestParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.BranchPullRequest(ctx, req)
	case MethodGitCommitsToTarget:
		var req GitTargetBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CommitsToTarget(ctx, req)
	case MethodGitBranchDiffSummary:
		var req GitTargetBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.BranchDiffSummary(ctx, req)
	case MethodGitCommitDiff:
		var req GitCommitDiffParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.CommitDiff(ctx, req)
	case MethodGitBranchDiff:
		var req GitBranchDiffParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.BranchDiff(ctx, req)
	case MethodGitBranches:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Branches(ctx, req)
	case MethodGitPush:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Push(ctx, req)
	case MethodGitPublish:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.Publish(ctx, req)
	case MethodGitRenameBranch:
		var req GitRenameBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.RenameBranch(ctx, req)
	case MethodGitRemoveBranch:
		var req GitRemoveBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.RemoveBranch(ctx, req)
	case MethodGitPrMerge:
		var req GitPrMergeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.PrMerge(ctx, req)
	case MethodGitPrClose:
		var req GitPrCloseParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.PrClose(ctx, req)
	case MethodGitWorktreeCreate:
		var req GitCreateWorktreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorktreeCreate(ctx, req)
	case MethodGitWorktreeRemove:
		var req GitRemoveWorktreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.WorktreeRemove(ctx, req)
	case MethodGitAuthorName:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.AuthorName(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown git method: "+method)
	}
}
