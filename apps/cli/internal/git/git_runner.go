package git

import (
	"context"
	"errors"
	"os/exec"
	"strings"

	gitexec "yishan/apps/cli/internal/git/exec"
)

// CommandRunner creates context-bound Git commands; false means Git is unavailable.
// GitService owns arguments, stdin, execution, and output interpretation.
type CommandRunner interface {
	CommandContext(context.Context, ...string) (*exec.Cmd, bool)
}

func (s *GitService) commandRunner() CommandRunner {
	if s != nil && s.runner != nil {
		return s.runner
	}
	return gitexec.DefaultRunner()
}

// runReadCommand accepts exit 1 only for the native check-ignore protocol.
func (s *GitService) runReadCommand(ctx context.Context, root, stdin string, allowNoMatch bool, args ...string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	cmd, isAvailable := s.commandRunner().CommandContext(ctx, append([]string{"-C", root}, args...)...)
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if !isAvailable || cmd == nil {
		return "", NewError(ErrCodeToolUnavailable, "git is not installed")
	}
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.Output()
	if contextErr := ctx.Err(); contextErr != nil {
		return "", contextErr
	}
	if err == nil {
		return string(out), nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if allowNoMatch && exitErr.ExitCode() == 1 {
			return string(out), nil
		}
		return "", NewError(ErrCodeToolUnavailable, strings.TrimSpace(string(exitErr.Stderr)))
	}
	return "", NewError(ErrCodeToolUnavailable, err.Error())
}
