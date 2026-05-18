package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

func (s *GitService) CreateWorktree(ctx context.Context, root string, branch string, worktreePath string, createBranch bool, fromRef string) error {
	if strings.TrimSpace(branch) == "" {
		return NewRPCError(-32602, "branch is required")
	}
	if strings.TrimSpace(worktreePath) == "" {
		return NewRPCError(-32602, "worktreePath is required")
	}

	absWorktreePath, err := filepath.Abs(worktreePath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absWorktreePath), 0o755); err != nil {
		return err
	}

	if createBranch {
		ref := strings.TrimSpace(fromRef)
		if ref == "" {
			ref = "HEAD"
		}
		_, err := gitCommandCombined(ctx, root, "worktree", "add", "-b", branch, absWorktreePath, ref)
		return err
	}

	_, err = gitCommandCombined(ctx, root, "worktree", "add", absWorktreePath, branch)
	return err
}

func (s *GitService) RemoveWorktree(ctx context.Context, root string, worktreePath string, force bool) error {
	if strings.TrimSpace(worktreePath) == "" {
		return NewRPCError(-32602, "worktreePath is required")
	}

	absWorktreePath, err := filepath.Abs(worktreePath)
	if err != nil {
		return err
	}

	args := []string{"worktree", "remove"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, absWorktreePath)
	_, err = gitCommandCombined(ctx, root, args...)
	return err
}
