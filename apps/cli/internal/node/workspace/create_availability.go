package workspace

import (
	"context"
	"fmt"
	"os"

	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/worktree"
)

func isLocalCreateAvailable(ctx context.Context, request workspace.CreateRequest) (bool, error) {
	paths, err := worktree.ResolveCreatePaths(worktree.CreateRequest{
		RepoKey: request.RepoKey, WorkspaceName: request.WorkspaceName, SourcePath: request.SourcePath,
	})
	if err != nil {
		return false, err
	}
	if _, err := os.Lstat(paths.WorktreePath); err == nil {
		return false, nil
	} else if !os.IsNotExist(err) {
		return false, fmt.Errorf("inspect worktree path: %w", err)
	}
	return !worktree.RefExists(ctx, paths.SourcePath, request.TargetBranch), nil
}
