package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	agentcmd "yishan/apps/cli/internal/daemon/agentcmd"
	"yishan/apps/cli/internal/api"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/runtime/shellenv"
)

const (
	agentExecTimeout = 5 * time.Minute

	// agentExecErrorCode is the error code reported when an agent process fails to run.
	agentExecErrorCode = "AGENT_EXEC_ERROR"
)

// jobRunParams matches the relay protocol's job.run notification params.
type jobRunParams struct {
	RunID          string         `json:"runId"`
	JobID          string         `json:"jobId"`
	ScheduledFor   string         `json:"scheduledFor"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Payload        map[string]any `json:"payload"`
}

// handleJobRun processes a job.run notification received from the relay.
// It sends job.ack / job.result back over the relay WS connection.
func handleJobRun(runtime *cliruntime.Runtime, connState *wsConnState, nodeID string, raw json.RawMessage) {
	var params jobRunParams
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
	go processRelayJob(runtime, connState, nodeID, params)
}

func processRelayJob(runtime *cliruntime.Runtime, connState *wsConnState, nodeID string, params jobRunParams) {
	startTime := time.Now()
	client := runtime.APIClient()

	_, err := client.StartScheduledJobRun(nodeID, api.StartScheduledJobRunInput{
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

	_, execErr := runAgent(agentKind, prompt, model, projectPath)
	finishedAt := time.Now()
	durationMs := finishedAt.Sub(startTime).Milliseconds()

	// Report to API
	apiInput := api.CompleteScheduledJobRunInput{
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
		sendJobResult(connState, params.RunID, "failed", durationMs, nil, &jobResultError{
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

type jobAckNotification struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  jobAckParams `json:"params"`
}

type jobAckParams struct {
	RunID  string `json:"runId"`
	Status string `json:"status"` // "accepted" | "rejected"
	Reason string `json:"reason,omitempty"`
}

type jobResultNotification struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  jobResultParams `json:"params"`
}

type jobResultParams struct {
	RunID      string          `json:"runId"`
	Status     string          `json:"status"` // "completed" | "failed" | "cancelled"
	Output     map[string]any  `json:"output,omitempty"`
	Error      *jobResultError `json:"error,omitempty"`
	DurationMs int64           `json:"durationMs,omitempty"`
}

type jobResultError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}

func sendJobAck(connState *wsConnState, runID, status, reason string) {
	msg := jobAckNotification{
		JSONRPC: "2.0",
		Method:  "job.ack",
		Params: jobAckParams{
			RunID:  runID,
			Status: status,
			Reason: reason,
		},
	}
	if err := connState.WriteJSON(msg); err != nil {
		log.Error().Err(err).Str("runId", runID).Msg("scheduler: failed to send job.ack")
	}
}

func sendJobResult(connState *wsConnState, runID, status string, durationMs int64, output map[string]any, jobErr *jobResultError) {
	msg := jobResultNotification{
		JSONRPC: "2.0",
		Method:  "job.result",
		Params: jobResultParams{
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

func runAgent(agentKind, prompt, model, projectPath string) (output string, err error) {
	runCommand, err := agentcmd.BuildRunCommand(agentKind, prompt, model, false)
	if err != nil {
		return "", err
	}

	resolvedEnv := shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	binaryPath := runCommand.Binary
	if !filepath.IsAbs(binaryPath) {
		if resolvedBinary := strings.TrimSpace(shellenv.ResolveExecutablePathFromEnv(binaryPath, resolvedEnv)); resolvedBinary != "" {
			binaryPath = resolvedBinary
		}
	}

	// exec.CommandContext kills the process when the context deadline fires,
	// eliminating the time.After goroutine leak that occurred on every job
	// that completed before the timeout.
	ctx, cancel := context.WithTimeout(context.Background(), agentExecTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, runCommand.Args...)
	if projectPath != "" {
		cmd.Dir = projectPath
	}
	// Scheduled jobs should not emit desktop hook notifications. The managed
	// notify bridge only forwards events when these YISHAN_* hook context vars
	// are present, so we explicitly clear them for scheduler-spawned agent runs.
	cmd.Env = append(
		resolvedEnv,
		"YISHAN_WORKSPACE_ID=",
		"YISHAN_TAB_ID=",
		"YISHAN_PANE_ID=",
		"YISHAN_HOOK_INGRESS_URL=",
		"YISHAN_OBSERVER_TOKEN=",
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
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
