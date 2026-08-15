package node

import (
	"context"

	"yishan/apps/cli/internal/rpc"
)

// GitService implementation: each method resolves the workspace handle and
// performs one git operation.

func (s *Services) GitStatus(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitStatus(ctx)
}

func (s *Services) GitInspect(ctx context.Context, req rpc.GitInspectParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitInspect(ctx)
}

func (s *Services) GitInspectPath(ctx context.Context, req rpc.GitInspectPathParams) (any, error) {
	return s.gits.Inspect(ctx, req.Path)
}

func (s *Services) GitListChanges(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListChanges(ctx)
}

func (s *Services) GitTrack(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitTrackChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"tracked": true}, nil
}

func (s *Services) GitUnstage(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitUnstageChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"unstaged": true}, nil
}

func (s *Services) GitRevert(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRevertChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"reverted": true}, nil
}

func (s *Services) GitCommit(ctx context.Context, req rpc.GitCommitParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitCommitChanges(ctx, req.Message, req.Amend, req.Signoff)
}

func (s *Services) GitBranchStatus(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchStatus(ctx)
}

func (s *Services) GitBranchPullRequest(ctx context.Context, req rpc.GitBranchPullRequestParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchPullRequest(ctx, req.Branch)
}

func (s *Services) GitCommitsToTarget(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListCommitsToTarget(ctx, req.TargetBranch)
}

func (s *Services) GitBranchDiffSummary(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchDiffSummary(ctx, req.TargetBranch)
}

func (s *Services) GitCommitDiff(ctx context.Context, req rpc.GitCommitDiffParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadCommitDiff(ctx, req.CommitHash, req.Path)
}

func (s *Services) GitBranchDiff(ctx context.Context, req rpc.GitBranchDiffParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadBranchComparisonDiff(ctx, req.TargetBranch, req.Path)
}

func (s *Services) GitBranches(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListBranches(ctx)
}

func (s *Services) GitPush(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPushBranch(ctx)
}

func (s *Services) GitPublish(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPublishBranch(ctx)
}

func (s *Services) GitRenameBranch(ctx context.Context, req rpc.GitRenameBranchParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRenameBranch(ctx, req.NextBranch); err != nil {
		return nil, err
	}
	return map[string]bool{"renamed": true}, nil
}

func (s *Services) GitRemoveBranch(ctx context.Context, req rpc.GitRemoveBranchParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveBranch(ctx, req.Branch, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (s *Services) GitPrMerge(ctx context.Context, req rpc.GitPrMergeParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrMerge(ctx, req.PrNumber, req.Method, req.DeleteBranch)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (s *Services) GitPrClose(ctx context.Context, req rpc.GitPrCloseParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrClose(ctx, req.PrNumber)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (s *Services) GitWorktreeCreate(ctx context.Context, req rpc.GitCreateWorktreeParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitCreateWorktree(ctx, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
		return nil, err
	}
	return map[string]bool{"created": true}, nil
}

func (s *Services) GitWorktreeRemove(ctx context.Context, req rpc.GitRemoveWorktreeParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveWorktree(ctx, req.WorktreePath, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (s *Services) GitAuthorName(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.workspaceHandle(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitAuthorName(ctx)
}
