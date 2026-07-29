package daemon

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"

	"yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/memory"
)

const maxAgentFailureDetailChars = 500


func buildRunAgentFunc() memory.RunAgentFunc {
	return BuildRunAgentFunc()
}

func BuildRunAgentFunc() memory.RunAgentFunc {
	return func(ctx context.Context, agentKind, model, prompt, workDir string) (string, error) {
		cmd, err := agentcmd.ResolveCommand(agentKind, prompt, model, false)
		if err != nil {
			if errors.Is(err, agentcmd.ErrBinaryNotFound) {
				return "", fmt.Errorf("%w: %s", memory.ErrAgentNotFound, agentKind)
			}
			return "", fmt.Errorf("run %s: %w", agentKind, err)
		}
		return runResolvedAgentCommand(ctx, cmd, workDir)
	}
}

func runResolvedAgentCommand(ctx context.Context, cmd agentcmd.ResolvedCommand, workDir string) (string, error) {
	execCmd := exec.CommandContext(ctx, cmd.ResolvedBinary, cmd.Args...)
	execCmd.Env = append(cmd.Env, cmd.ExtraEnv...)
	if workDir != "" {
		execCmd.Dir = workDir
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	execCmd.Stdout = &stdout
	execCmd.Stderr = &stderr

	if err := execCmd.Run(); err != nil {
		stdoutText := stdout.String()
		return stdoutText, formatRunAgentError(cmd.ResolvedBinary, stdoutText, stderr.String(), err)
	}
	return stdout.String(), nil
}

func formatRunAgentError(binaryPath string, stdoutText string, stderrText string, err error) error {
	detail := buildAgentFailureDetail(stdoutText, stderrText)
	if detail == "" {
		return fmt.Errorf("run %s: %w", binaryPath, err)
	}
	return fmt.Errorf("run %s: %w: %s", binaryPath, err, detail)
}

func buildAgentFailureDetail(stdoutText string, stderrText string) string {
	trimmedStdout := strings.TrimSpace(stdoutText)
	trimmedStderr := strings.TrimSpace(stderrText)

	var detail string
	switch {
	case trimmedStderr != "" && trimmedStdout != "":
		detail = fmt.Sprintf("stderr: %s; stdout: %s", trimmedStderr, trimmedStdout)
	case trimmedStderr != "":
		detail = "stderr: " + trimmedStderr
	case trimmedStdout != "":
		detail = "stdout: " + trimmedStdout
	default:
		return ""
	}

	return truncateAgentFailureDetail(detail)
}

func truncateAgentFailureDetail(detail string) string {
	if len(detail) <= maxAgentFailureDetailChars {
		return detail
	}
	return detail[:maxAgentFailureDetailChars-3] + "..."
}
