// Package worktree owns git worktree provisioning: path resolution, worktree
// creation, worktree removal, and branch cleanup. The workspace layer (manager,
// create flow) and the instance handle call it instead of invoking git
// directly. The package deliberately publishes no UI events and calls no cloud
// API; setup hooks and context links stay outside it.
package worktree

import (
	"context"
	"errors"
	"os/exec"
	"strings"

	gitexec "yishan/apps/cli/internal/git/exec"
)

func gitCommand(ctx context.Context, cwd string, args ...string) (string, error) {
	runner := gitexec.DefaultRunner()
	out, err, ok := runner.Run(ctx, cwd, args...)
	if !ok {
		return "", NewError(ErrCodeToolUnavailable, "git is not installed")
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", NewError(ErrCodeToolUnavailable, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", err
	}
	return string(out), nil
}

func gitCommandCombined(ctx context.Context, cwd string, args ...string) (string, error) {
	runner := gitexec.DefaultRunner()
	out, err, ok := runner.RunCombined(ctx, cwd, args...)
	if !ok {
		return "", NewError(ErrCodeToolUnavailable, "git is not installed")
	}
	if err != nil {
		return "", NewError(ErrCodeToolUnavailable, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func splitNonEmptyLines(input string) []string {
	return gitexec.SplitNonEmptyLines(input)
}

// isNotGitRepositoryError reports whether err is an RPC error carrying git's
// "not a git repository" diagnostic. A worktree directory that still exists
// but has lost its git registration (no .git file/dir) can never be resolved
// by retrying, so callers treat it as an already-gone state.
func isNotGitRepositoryError(err error) bool {
	var worktreeErr *Error
	if !errors.As(err, &worktreeErr) {
		return false
	}
	return strings.Contains(worktreeErr.Message, "not a git repository")
}
