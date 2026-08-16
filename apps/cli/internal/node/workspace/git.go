package workspace

import (
	"context"

	"yishan/apps/cli/internal/rpc"
)

// GitService implementation: each method resolves the workspace handle and
// performs one git operation.

func (s *Service) Status(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitStatus(ctx)
}

func (s *Service) Inspect(ctx context.Context, req rpc.GitInspectParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitInspect(ctx)
}

func (s *Service) InspectPath(ctx context.Context, req rpc.GitInspectPathParams) (any, error) {
	return s.deps.Git.Inspect(ctx, req.Path)
}

func (s *Service) ListChanges(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListChanges(ctx)
}

func (s *Service) Track(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitTrackChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"tracked": true}, nil
}

func (s *Service) Unstage(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitUnstageChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"unstaged": true}, nil
}

func (s *Service) Revert(ctx context.Context, req rpc.GitPathsParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRevertChanges(ctx, req.Paths); err != nil {
		return nil, err
	}
	return map[string]bool{"reverted": true}, nil
}

func (s *Service) Commit(ctx context.Context, req rpc.GitCommitParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitCommitChanges(ctx, req.Message, req.Amend, req.Signoff)
}

func (s *Service) BranchStatus(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchStatus(ctx)
}

func (s *Service) BranchPullRequest(ctx context.Context, req rpc.GitBranchPullRequestParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchPullRequest(ctx, req.Branch)
}

func (s *Service) CommitsToTarget(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListCommitsToTarget(ctx, req.TargetBranch)
}

func (s *Service) BranchDiffSummary(ctx context.Context, req rpc.GitTargetBranchParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitBranchDiffSummary(ctx, req.TargetBranch)
}

func (s *Service) CommitDiff(ctx context.Context, req rpc.GitCommitDiffParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadCommitDiff(ctx, req.CommitHash, req.Path)
}

func (s *Service) BranchDiff(ctx context.Context, req rpc.GitBranchDiffParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitReadBranchComparisonDiff(ctx, req.TargetBranch, req.Path)
}

func (s *Service) Branches(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitListBranches(ctx)
}

func (s *Service) Push(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPushBranch(ctx)
}

func (s *Service) Publish(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitPublishBranch(ctx)
}

func (s *Service) RenameBranch(ctx context.Context, req rpc.GitRenameBranchParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRenameBranch(ctx, req.NextBranch); err != nil {
		return nil, err
	}
	return map[string]bool{"renamed": true}, nil
}

func (s *Service) RemoveBranch(ctx context.Context, req rpc.GitRemoveBranchParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveBranch(ctx, req.Branch, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (s *Service) PrMerge(ctx context.Context, req rpc.GitPrMergeParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrMerge(ctx, req.PrNumber, req.Method, req.DeleteBranch)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (s *Service) PrClose(ctx context.Context, req rpc.GitPrCloseParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	out, err := handle.GitPrClose(ctx, req.PrNumber)
	if err != nil {
		return nil, err
	}
	return map[string]string{"output": out}, nil
}

func (s *Service) WorktreeCreate(ctx context.Context, req rpc.GitCreateWorktreeParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitCreateWorktree(ctx, req.Branch, req.WorktreePath, req.CreateBranch, req.FromRef); err != nil {
		return nil, err
	}
	return map[string]bool{"created": true}, nil
}

func (s *Service) WorktreeRemove(ctx context.Context, req rpc.GitRemoveWorktreeParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if err := handle.GitRemoveWorktree(ctx, req.WorktreePath, req.Force); err != nil {
		return nil, err
	}
	return map[string]bool{"removed": true}, nil
}

func (s *Service) AuthorName(ctx context.Context, req rpc.GitStatusParams) (any, error) {
	handle, err := s.HandleFor(req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	return handle.GitAuthorName(ctx)
}
