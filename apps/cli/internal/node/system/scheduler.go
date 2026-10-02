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

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/cloud/session"
	agentcmd "yishan/apps/cli/internal/agent/command"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

const (
	agentExecTimeout = 5 * time.Minute

	// agentExecErrorCode is the error code reported when an agent process fails to run.
	agentExecErrorCode = "AGENT_EXEC_ERROR"
)

// HandleJobRun processes a job.run notification received from the relay: it
// validates the payload, sends job.ack, and runs the scheduled agent
// asynchronously.
func HandleJobRun(runtime *session.Session, connState *rpc.Connection, nodeID string, raw json.RawMessage, daemonWSEndpoint string) {
	var params relayprotocol.JobRunParams
	if err := json.Unmarshal(raw, &params); err != nil {
		log.Warn().Err(err).Msg("scheduler: invalid job.run params")
		sendJobAck(connState, params.RunID, "rejected", "invalid params")
		return
	}

	if params.RunID == "" || params.JobID == "" {
		log.Warn().Msg("scheduler: skipping malformed job.run (missing runId or jobId)")
		sendJobAck(connState, params.RunID, "rejected", "missing runId or jobId")
		return
	}

	if runtime == nil || !runtime.APIConfigured() {
		log.Warn().Msg("scheduler: API not configured, rejecting job.run")
		sendJobAck(connState, params.RunID, "rejected", "API not configured")
		return
	}

	// Accept the job
	sendJobAck(connState, params.RunID, "accepted", "")

	// Process asynchronously so the relay read loop is not blocked
	go processRelayJob(runtime, connState, nodeID, params, daemonWSEndpoint)
}

func processRelayJob(runtime *session.Session, connState *rpc.Connection, nodeID string, params relayprotocol.JobRunParams, daemonWSEndpoint string) {
	startedAt := time.Now()
	client := runtime.APIClient()
	startResponse, err := client.StartScheduledJobRun(nodeID, cloud.StartScheduledJobRunInput{
		RunID:     params.RunID,
		StartedAt: startedAt.UTC().Format(time.RFC3339),
	})
	if err != nil {
		reportRelayStartFailure(connState, params.RunID, startedAt, err)
		return
	}
	if !startResponse.Started {
		sendJobResult(connState, params.RunID, "completed", time.Since(startedAt).Milliseconds(), map[string]any{"duplicate": true}, nil)
		return
	}
	processStartedRelayJob(client, connState, nodeID, params, daemonWSEndpoint, startedAt)
}

const scheduledJobRunStartErrorCode = "SCHEDULED_JOB_RUN_START_ERROR"

func reportRelayStartFailure(connState *rpc.Connection, runID string, startedAt time.Time, err error) {
	log.Error().Err(err).Str("runId", runID).Msg("scheduler: failed to mark run started")
	sendJobResult(connState, runID, "failed", time.Since(startedAt).Milliseconds(), nil, &relayprotocol.JobError{
		Code: scheduledJobRunStartErrorCode, Message: err.Error(),
	})
}

func processStartedRelayJob(client *cloud.Client, connState *rpc.Connection, nodeID string, params relayprotocol.JobRunParams, daemonWSEndpoint string, startedAt time.Time) {
	agentKind, _ := params.Payload["agentKind"].(string)
	prompt, _ := params.Payload["prompt"].(string)
	model, _ := params.Payload["model"].(string)
	projectPath, _ := params.Payload["projectPath"].(string)
	log.Info().Str("runId", params.RunID).Str("agentKind", agentKind).Str("prompt", prompt).Str("model", model).Str("projectPath", projectPath).Msg("scheduler: executing agent")

	_, execErr := runAgent(agentKind, prompt, model, projectPath, daemonWSEndpoint)
	finishedAt := time.Now()
	if execErr != nil {
		reportRelayAgentFailure(client, connState, nodeID, params.RunID, startedAt, finishedAt, execErr)
		return
	}
	reportRelayAgentSuccess(client, connState, nodeID, params.RunID, startedAt, finishedAt)
}

func reportRelayAgentFailure(client *cloud.Client, connState *rpc.Connection, nodeID, runID string, startedAt, finishedAt time.Time, execErr error) {
	completeRelayJob(client, nodeID, cloud.CompleteScheduledJobRunInput{RunID: runID, FinishedAt: finishedAt.UTC().Format(time.RFC3339), Status: "failed", ErrorCode: agentExecErrorCode, ErrorMessage: execErr.Error()})
	sendJobResult(connState, runID, "failed", finishedAt.Sub(startedAt).Milliseconds(), nil, &relayprotocol.JobError{Code: agentExecErrorCode, Message: execErr.Error()})
}

func reportRelayAgentSuccess(client *cloud.Client, connState *rpc.Connection, nodeID, runID string, startedAt, finishedAt time.Time) {
	completeRelayJob(client, nodeID, cloud.CompleteScheduledJobRunInput{RunID: runID, FinishedAt: finishedAt.UTC().Format(time.RFC3339), Status: "succeeded"})
	sendJobResult(connState, runID, "completed", finishedAt.Sub(startedAt).Milliseconds(), nil, nil)
}

func completeRelayJob(client *cloud.Client, nodeID string, input cloud.CompleteScheduledJobRunInput) {
	if _, err := client.CompleteScheduledJobRun(nodeID, input); err != nil {
		log.Error().Err(err).Str("runId", input.RunID).Msg("scheduler: failed to report run result")
	}
}

// ---------------------------------------------------------------------------
// Relay protocol messages (job.ack and job.result)
// ---------------------------------------------------------------------------

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

func sendJobResult(connState *rpc.Connection, runID, status string, durationMs int64, output map[string]any, jobErr *relayprotocol.JobError) {
	msg := relayprotocol.Notification{
		JSONRPC: "2.0",
		Method:  relayprotocol.MethodJobResult,
		Params: relayprotocol.JobResultParams{
			RunID:      runID,
			Status:     status,
			Output:     output,
			Error:      jobErr,
			DurationMs: durationMs,
		},
	}
	if err := connState.WriteJSON(msg); err != nil {
		log.Error().Err(err).Str("runId", runID).Msg("scheduler: failed to send job.result")
	}
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

func runAgent(agentKind, prompt, model, projectPath string, daemonWSEndpoint string) (output string, err error) {
	return RunAgent(context.Background(), agentKind, prompt, model, projectPath, daemonWSEndpoint)
}

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
