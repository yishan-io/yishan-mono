package worktree

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpcerror"
)

// RemoveBranch deletes a branch in the repository at root.
func RemoveBranch(ctx context.Context, root string, branch string, force bool) error {
	if strings.TrimSpace(branch) == "" {
		return rpcerror.NewRPCError(rpcerror.CodeInvalidParams, "branch is required")
	}
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := gitCommandCombined(ctx, root, "branch", flag, branch)
	return err
}
