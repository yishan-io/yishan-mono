package worktree

import (
	"context"
	"strings"

)

// RemoveBranch deletes a branch in the repository at root.
func RemoveBranch(ctx context.Context, root string, branch string, force bool) error {
	if strings.TrimSpace(branch) == "" {
		return NewError(ErrCodeInvalidParams, "branch is required")
	}
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := gitCommandCombined(ctx, root, "branch", flag, branch)
	return err
}
