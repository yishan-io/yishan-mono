package system

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"

	agentcmd "yishan/apps/cli/internal/agent/command"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/memory"
)

const maxAgentFailureDetailChars = 500

// BuildRunAgentFunc returns the memory summarizer's agent runner: it resolves
// the agent command (agentkind/model/prompt), runs it, and returns its output.
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

// BuildAgentSubprocessEnv augments baseEnv — the login-shell merged + PATH
// enriched environment produced by agentcmd.ResolveCommand — with
// PI_CODING_AGENT_DIR pointing at the managed pi agent dir. This mirrors
// agentmanager.Manager.Start so spawned pi subprocesses read the managed
// config/auth instead of the stale ~/.pi/agent default.
func BuildAgentSubprocessEnv(baseEnv []string) ([]string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	// Drop any inherited PI_CODING_AGENT_DIR so the managed value wins
	// regardless of how the platform resolves duplicate env keys.
	filtered := baseEnv[:0:0]
	for _, entry := range baseEnv {
		if strings.HasPrefix(entry, config.PiAgentDirEnvKey+"=") {
			continue
		}
		filtered = append(filtered, entry)
	}
	return append(filtered, config.PiAgentDirEnvKey+"="+piAgentDir), nil
}

func runResolvedAgentCommand(ctx context.Context, cmd agentcmd.ResolvedCommand, workDir string) (string, error) {
	env, err := BuildAgentSubprocessEnv(cmd.Env)
	if err != nil {
		return "", err
	}

	execCmd := exec.CommandContext(ctx, cmd.ResolvedBinary, cmd.Args...)
	execCmd.Env = append(env, cmd.ExtraEnv...)
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
