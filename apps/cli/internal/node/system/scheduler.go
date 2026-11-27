package system

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"

	"github.com/rs/zerolog/log"

	relayprotocol "yishan/packages/relay-protocol-go"

	agentcmd "yishan/apps/cli/internal/agent/command"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

const agentExecTimeout = 5 * time.Minute

// RejectRelayJobRun answers a job.run dispatched by api-service. Scheduled
// jobs run from the daemon's local scheduler now, so remote dispatches are
// rejected and api-service records the run as not executed.
func RejectRelayJobRun(connState *rpc.Connection, raw json.RawMessage) {
	var params relayprotocol.JobRunParams
	_ = json.Unmarshal(raw, &params) // An unreadable payload is rejected the same way.
	sendJobAck(connState, params.RunID, "rejected", "scheduled jobs now run from the local daemon")
}

func sendJobAck(connState *rpc.Connection, runID, status, reason string) {
	msg := relayprotocol.Notification{
		JSONRPC: "2.0",
		Method:  relayprotocol.MethodJobAck,
		Params: relayprotocol.JobAckParams{
			RunID:  runID,
			Status: status,
			Reason: reason,
		},
	}
	if err := connState.WriteJSON(msg); err != nil {
		log.Error().Err(err).Str("runId", runID).Msg("scheduler: failed to send job.ack")
	}
}

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
