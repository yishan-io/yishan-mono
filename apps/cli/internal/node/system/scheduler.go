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
	startTime := time.Now()
	client := runtime.APIClient()

	_, err := client.StartScheduledJobRun(nodeID, cloud.StartScheduledJobRunInput{
		RunID:     params.RunID,
		StartedAt: startTime.UTC().Format(time.RFC3339),
	})
	if err != nil {
		log.Error().Err(err).Str("runId", params.RunID).Msg("scheduler: failed to mark run started")
	}

	// Extract agent execution params from the payload
	agentKind, _ := params.Payload["agentKind"].(string)
	prompt, _ := params.Payload["prompt"].(string)
	model, _ := params.Payload["model"].(string)
	projectPath, _ := params.Payload["projectPath"].(string)

	log.Info().
		Str("runId", params.RunID).
		Str("agentKind", agentKind).
		Str("prompt", prompt).
		Str("model", model).
		Str("projectPath", projectPath).
		Msg("scheduler: executing agent")

	_, execErr := runAgent(agentKind, prompt, model, projectPath, daemonWSEndpoint)
	finishedAt := time.Now()
	durationMs := finishedAt.Sub(startTime).Milliseconds()

	// Report to API
	apiInput := cloud.CompleteScheduledJobRunInput{
		RunID:      params.RunID,
		FinishedAt: finishedAt.UTC().Format(time.RFC3339),
	}

	if execErr != nil {
		apiInput.Status = "failed"
		apiInput.ErrorCode = agentExecErrorCode
		apiInput.ErrorMessage = execErr.Error()
	} else {
		apiInput.Status = "succeeded"
	}

	_, reportErr := client.CompleteScheduledJobRun(nodeID, apiInput)
	if reportErr != nil {
		log.Error().Err(reportErr).Str("runId", params.RunID).Msg("scheduler: failed to report run result")
	}

	// Send job.result back to relay
	if execErr != nil {
		sendJobResult(connState, params.RunID, "failed", durationMs, nil, &relayprotocol.JobError{
			Code:    agentExecErrorCode,
			Message: execErr.Error(),
		})
	} else {
		sendJobResult(connState, params.RunID, "completed", durationMs, nil, nil)
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
	cmd, err := agentcmd.ResolveCommand(agentKind, prompt, model, false)
	if err != nil {
		return "", err
	}

	env, err := BuildAgentSubprocessEnv(cmd.Env, daemonWSEndpoint)
	if err != nil {
		return "", err
	}

	// exec.CommandContext kills the process when the context deadline fires,
	// eliminating the time.After goroutine leak that occurred on every job
	// that completed before the timeout.
	ctx, cancel := context.WithTimeout(context.Background(), agentExecTimeout)
	defer cancel()

	execCmd := exec.CommandContext(ctx, cmd.ResolvedBinary, cmd.Args...)
	if projectPath != "" {
		execCmd.Dir = projectPath
	}
	// Scheduled jobs should not emit desktop hook notifications. The managed
	// notify bridge only forwards events when these YISHAN_* hook context vars
	// are present, so we explicitly clear them for scheduler-spawned agent runs.
	execCmd.Env = config.OverrideDaemonWSEndpointEnv(append(
		env,
		"YISHAN_WORKSPACE_ID=",
		"YISHAN_TAB_ID=",
		"YISHAN_PANE_ID=",
		"YISHAN_HOOK_INGRESS_URL=",
		"YISHAN_OBSERVER_TOKEN=",
	), daemonWSEndpoint)
	var stdout, stderr bytes.Buffer
	execCmd.Stdout = &stdout
	execCmd.Stderr = &stderr

	if err := execCmd.Run(); err != nil {
		combined := stdout.String()
		if stderr.Len() > 0 {
			combined += "\n" + stderr.String()
		}
		if ctx.Err() == context.DeadlineExceeded {
			return combined, fmt.Errorf("agent timed out after %s", agentExecTimeout)
		}
		return combined, fmt.Errorf("agent exited with error: %w", err)
	}

	combined := stdout.String()
	if stderr.Len() > 0 {
		combined += "\n" + stderr.String()
	}
	return combined, nil
}
