package worktree

import (
	"context"
	"os"
	"path/filepath"
	"strings"

)

// RemoveRequest carries the teardown options for a worktree.
type RemoveRequest struct {
	// Path is the worktree path to remove.
	Path string
	// Branch is the branch to delete (only when RemoveBranch). When empty it is
	// resolved from the worktree's current branch.
	Branch        string
	RemoveBranch  bool
	ForceWorktree bool
	ForceBranch   bool
}

// Remove tears down a worktree (the normal close path): it resolves the main
// worktree for the path, removes the worktree, and optionally the branch. A
// directory that still exists but lost its git registration is treated as
// already gone (the leftover directory is deliberately not removed).
func Remove(ctx context.Context, req RemoveRequest) error {
	if strings.TrimSpace(req.Path) == "" {
		return NewError(ErrCodeInvalidParams, "path is required")
	}

	mainWorktreePath, err := MainWorktreePath(ctx, req.Path)
	if err != nil {
		if isNotGitRepositoryError(err) {
			// Directory exists but git registration is gone: nothing left to
			// tear down via git, and the error can never resolve on retry.
			return nil
		}
		return err
	}

	branch := req.Branch
	if req.RemoveBranch && branch == "" {
		branch, err = currentBranch(ctx, req.Path)
		if err != nil {
			return err
		}
	}

	if err := RemoveWorktree(ctx, mainWorktreePath, req.Path, req.ForceWorktree); err != nil {
		return err
	}
	if req.RemoveBranch {
		if err := RemoveBranch(ctx, mainWorktreePath, branch, req.ForceBranch); err != nil {
			return err
		}
	}
	return nil
}

// RemoveWorktree removes a git worktree at the given path (run from its main
// worktree/repo root).
func RemoveWorktree(ctx context.Context, root string, worktreePath string, force bool) error {
	if strings.TrimSpace(worktreePath) == "" {
		return NewError(ErrCodeInvalidParams, "worktreePath is required")
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

// MainWorktreePath resolves the main worktree path for a repository, which is
// the git root used for worktree removal and branch deletion.
func MainWorktreePath(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "worktree", "list", "--porcelain")
	if err != nil {
		return "", err
	}
	for line := range strings.SplitSeq(out, "\n") {
		if path, ok := strings.CutPrefix(line, "worktree "); ok {
			path = strings.TrimSpace(path)
			if path != "" {
				return path, nil
			}
		}
	}
	return "", NewError(ErrCodeToolUnavailable, "main worktree not found")
}

// CleanupPartial removes a partially created worktree and its branch on a
// best-effort basis. This prevents orphaned branches and worktree directories
// from accumulating when a creation step fails after the worktree step
// succeeded. Uses the same removal primitives as the normal close path.
func CleanupPartial(ctx context.Context, repoRoot string, worktreePath string, branch string) {
	if strings.TrimSpace(worktreePath) == "" {
		return
	}
	// Try to remove the worktree first (this also cleans up .git/worktrees entry).
	if _, err := os.Stat(worktreePath); err == nil {
		if removeErr := RemoveWorktree(ctx, repoRoot, worktreePath, true); removeErr != nil {
			// Worktree removal via git failed — try removing directory directly.
			_ = os.RemoveAll(worktreePath)
		}
	}

	// Remove the branch that was created by `git worktree add -b`.
	if strings.TrimSpace(branch) != "" && RefExists(ctx, repoRoot, branch) {
		_ = RemoveBranch(ctx, repoRoot, branch, true)
	}
}

// currentBranch resolves the branch checked out at a worktree path. Returns an
// error when the worktree is not on a named branch (detached HEAD).
func currentBranch(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	branch := strings.TrimSpace(out)
	if branch == "" || branch == "HEAD" {
		return "", NewError(ErrCodeToolUnavailable, "workspace is not on a branch")
	}
	return branch, nil
}
