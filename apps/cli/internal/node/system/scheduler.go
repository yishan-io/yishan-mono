package system

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"

	agentcmd "yishan/apps/cli/internal/agent/command"
	"yishan/apps/cli/internal/platform/config"
)

const agentExecTimeout = 5 * time.Minute

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

// RunAgent runs a scheduled agent process with a caller-bound timeout.
func RunAgent(parent context.Context, agentKind, prompt, model, projectPath string, daemonWSEndpoint string) (string, error) {
	cmd, err := agentcmd.ResolveCommand(agentKind, prompt, model, false)
	if err != nil {
		return "", err
	}
	env, err := BuildAgentSubprocessEnv(cmd.Env, daemonWSEndpoint)
	if err != nil {
		return "", err
	}
	return runResolvedAgent(parent, cmd, env, projectPath, daemonWSEndpoint)
}

func runResolvedAgent(parent context.Context, cmd agentcmd.ResolvedCommand, env []string, projectPath, daemonWSEndpoint string) (string, error) {
	ctx, cancel := context.WithTimeout(parent, agentExecTimeout)
	defer cancel()
	execCmd := exec.CommandContext(ctx, cmd.ResolvedBinary, cmd.Args...)
	execCmd.Dir = projectPath
	execCmd.Env = schedulerAgentEnvironment(env, daemonWSEndpoint)
	var stdout, stderr bytes.Buffer
	execCmd.Stdout, execCmd.Stderr = &stdout, &stderr
	if err := execCmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return schedulerAgentOutput(&stdout, &stderr), fmt.Errorf("agent timed out after %s", agentExecTimeout)
		}
		if ctx.Err() != nil {
			return schedulerAgentOutput(&stdout, &stderr), fmt.Errorf("agent execution canceled: %w", ctx.Err())
		}
		return schedulerAgentOutput(&stdout, &stderr), fmt.Errorf("agent exited with error: %w", err)
	}
	return schedulerAgentOutput(&stdout, &stderr), nil
}

func schedulerAgentEnvironment(env []string, daemonWSEndpoint string) []string {
	// Scheduled jobs should not emit desktop hook notifications. The managed
	// notify bridge only forwards events when these YISHAN_* hook context vars
	// are present, so clear them for scheduler-spawned agent runs.
	return config.OverrideDaemonWSEndpointEnv(append(env,
		"YISHAN_WORKSPACE_ID=", "YISHAN_TAB_ID=", "YISHAN_PANE_ID=",
		"YISHAN_HOOK_INGRESS_URL=", "YISHAN_OBSERVER_TOKEN=",
	), daemonWSEndpoint)
}

func schedulerAgentOutput(stdout, stderr *bytes.Buffer) string {
	combined := stdout.String()
	if stderr.Len() > 0 {
		combined += "\n" + stderr.String()
	}
	return combined
}
