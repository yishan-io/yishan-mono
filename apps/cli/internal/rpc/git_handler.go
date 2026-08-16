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
		return h.Services.GitStatus(ctx, req)
	case MethodGitInspect:
		var req GitInspectParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitInspect(ctx, req)
	case MethodGitInspectPath:
		var req GitInspectPathParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitInspectPath(ctx, req)
	case MethodGitListChanges:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitListChanges(ctx, req)
	case MethodGitTrack:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitTrack(ctx, req)
	case MethodGitUnstage:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitUnstage(ctx, req)
	case MethodGitRevert:
		var req GitPathsParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitRevert(ctx, req)
	case MethodGitCommit:
		var req GitCommitParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitCommit(ctx, req)
	case MethodGitBranchStatus:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitBranchStatus(ctx, req)
	case MethodGitBranchPullRequest:
		var req GitBranchPullRequestParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitBranchPullRequest(ctx, req)
	case MethodGitCommitsToTarget:
		var req GitTargetBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitCommitsToTarget(ctx, req)
	case MethodGitBranchDiffSummary:
		var req GitTargetBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitBranchDiffSummary(ctx, req)
	case MethodGitCommitDiff:
		var req GitCommitDiffParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitCommitDiff(ctx, req)
	case MethodGitBranchDiff:
		var req GitBranchDiffParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitBranchDiff(ctx, req)
	case MethodGitBranches:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitBranches(ctx, req)
	case MethodGitPush:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitPush(ctx, req)
	case MethodGitPublish:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitPublish(ctx, req)
	case MethodGitRenameBranch:
		var req GitRenameBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitRenameBranch(ctx, req)
	case MethodGitRemoveBranch:
		var req GitRemoveBranchParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitRemoveBranch(ctx, req)
	case MethodGitPrMerge:
		var req GitPrMergeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitPrMerge(ctx, req)
	case MethodGitPrClose:
		var req GitPrCloseParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitPrClose(ctx, req)
	case MethodGitWorktreeCreate:
		var req GitCreateWorktreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitWorktreeCreate(ctx, req)
	case MethodGitWorktreeRemove:
		var req GitRemoveWorktreeParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitWorktreeRemove(ctx, req)
	case MethodGitAuthorName:
		var req GitStatusParams
		if err := DecodeParams(params, &req); err != nil {
			return nil, err
		}
		return h.Services.GitAuthorName(ctx, req)
	default:
		return nil, NewRPCError(CodeMethodNotFound, "unknown git method: "+method)
	}
}
