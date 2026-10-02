package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/adapter/cloud"
	nodesystem "yishan/apps/cli/internal/node/system"
)

const scheduledJobResponseBodyMaxLength = 4096

var (
	errScheduledJobCloudClient    = errors.New("scheduled jobs require a cloud client and node ID")
	errScheduledJobAlreadyStarted = errors.New("scheduled job run was already started")
)

type scheduledJobCloudAdapters struct {
	reconcile  nodesystem.LocalSchedulerSnapshot
	claim      nodesystem.LocalSchedulerClaim
	start      nodesystem.ScheduledRunOutboxStart
	startFresh nodesystem.ScheduledRunOutboxStart
	complete   nodesystem.ScheduledRunOutboxComplete
}

func newScheduledJobCloudAdapters(client *cloud.Client, nodeID string) (scheduledJobCloudAdapters, error) {
	if client == nil || strings.TrimSpace(nodeID) == "" {
		return scheduledJobCloudAdapters{}, errScheduledJobCloudClient
	}
	return scheduledJobCloudAdapters{
		reconcile:  buildScheduledJobReconcile(client, nodeID),
		claim:      buildScheduledJobClaim(client, nodeID),
		start:      buildScheduledJobStart(client, nodeID),
		startFresh: buildScheduledJobStartFresh(client, nodeID),
		complete:   buildScheduledJobComplete(client, nodeID),
	}, nil
}

func buildScheduledJobReconcile(client *cloud.Client, nodeID string) nodesystem.LocalSchedulerSnapshot {
	return func(ctx context.Context, protected []nodesystem.LocalScheduledJob) ([]nodesystem.LocalScheduledJob, error) {
		input := cloud.ReconcileScheduledJobsInput{ProtectedJobs: make([]cloud.ProtectedScheduledJob, len(protected))}
		for index, job := range protected {
			input.ProtectedJobs[index] = cloud.ProtectedScheduledJob{JobID: job.ID, NextRunAt: job.NextRunAt}
		}
		response, err := client.ReconcileScheduledJobsContext(ctx, nodeID, input)
		if err != nil {
			return nil, err
		}
		return mapReconciledScheduledJobs(response.Jobs)
	}
}

func mapReconciledScheduledJobs(jobs []cloud.ScheduledJob) ([]nodesystem.LocalScheduledJob, error) {
	mapped := make([]nodesystem.LocalScheduledJob, len(jobs))
	for index, job := range jobs {
		nextRunAt, err := parseScheduledJobTime(job.NextRunAt)
		if err != nil {
			return nil, fmt.Errorf("parse scheduled job %q next run: %w", job.ID, err)
		}
		mapped[index] = nodesystem.LocalScheduledJob{ID: job.ID, Status: "active", NextRunAt: nextRunAt}
	}
	return mapped, nil
}

func buildScheduledJobClaim(client *cloud.Client, nodeID string) nodesystem.LocalSchedulerClaim {
	return func(ctx context.Context, jobID string, expectedNextRunAt time.Time) (nodesystem.LocalSchedulerClaimResult, error) {
		response, err := client.ClaimScheduledJobContext(ctx, nodeID, cloud.ClaimScheduledJobInput{JobID: jobID, ExpectedNextRunAt: expectedNextRunAt})
		if err != nil {
			return nodesystem.LocalSchedulerClaimResult{}, err
		}
		return mapScheduledJobClaim(response)
	}
}

func mapScheduledJobClaim(response cloud.ClaimScheduledJobResponse) (nodesystem.LocalSchedulerClaimResult, error) {
	scheduledFor, err := parseScheduledJobTime(response.ScheduledFor)
	if err != nil {
		return nodesystem.LocalSchedulerClaimResult{}, fmt.Errorf("parse scheduled run %q time: %w", response.RunID, err)
	}
	nextRunAt, err := parseScheduledJobTime(response.Job.NextRunAt)
	if err != nil {
		return nodesystem.LocalSchedulerClaimResult{}, fmt.Errorf("parse scheduled job %q next run: %w", response.Job.ID, err)
	}
	return nodesystem.LocalSchedulerClaimResult{JobID: response.Job.ID, RunID: response.RunID, ScheduledFor: scheduledFor,
		Agent: response.Job.AgentKind, Prompt: response.Job.Prompt, Model: response.Job.Model, ProjectPath: response.ProjectPath, NextRunAt: nextRunAt}, nil
}

func parseScheduledJobTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

// buildScheduledJobStart accepts an already-started run because recovery must
// finalize it as interrupted rather than reject a durable prior claim.
func buildScheduledJobStart(client *cloud.Client, nodeID string) nodesystem.ScheduledRunOutboxStart {
	return func(ctx context.Context, row nodesystem.ScheduledRunOutboxRow, startedAt time.Time) error {
		_, err := startScheduledJobRun(ctx, client, nodeID, row, startedAt)
		return err
	}
}

// buildScheduledJobStartFresh rejects an already-started run before a new
// executor can launch an agent process.
func buildScheduledJobStartFresh(client *cloud.Client, nodeID string) nodesystem.ScheduledRunOutboxStart {
	return func(ctx context.Context, row nodesystem.ScheduledRunOutboxRow, startedAt time.Time) error {
		response, err := startScheduledJobRun(ctx, client, nodeID, row, startedAt)
		if err != nil || response.Started {
			return err
		}
		return errScheduledJobAlreadyStarted
	}
}

func startScheduledJobRun(ctx context.Context, client *cloud.Client, nodeID string, row nodesystem.ScheduledRunOutboxRow, startedAt time.Time) (cloud.StartScheduledJobRunResponse, error) {
	return client.StartScheduledJobRunContext(ctx, nodeID, cloud.StartScheduledJobRunInput{
		RunID:     row.RunID,
		StartedAt: scheduledJobTime(startedAt),
	})
}

func isScheduledJobStartRejected(err error) bool {
	return errors.Is(err, errScheduledJobAlreadyStarted) || cloud.IsScheduledJobRunStartRejected(err)
}

func buildScheduledJobComplete(client *cloud.Client, nodeID string) nodesystem.ScheduledRunOutboxComplete {
	return func(ctx context.Context, row nodesystem.ScheduledRunOutboxRow, finishedAt time.Time) error {
		input := cloud.CompleteScheduledJobRunInput{RunID: row.RunID, FinishedAt: scheduledJobTime(finishedAt), Status: row.Result.Status,
			ResponseBody: row.Result.ResponseBody, ErrorCode: row.Result.ErrorCode, ErrorMessage: row.Result.ErrorMessage}
		response, err := client.CompleteScheduledJobRunContext(ctx, nodeID, input)
		if err != nil {
			return err
		}
		if !response.Accepted {
			log.Warn().Str("runId", row.RunID).Msg("scheduled job result conflicts with authoritative server outcome")
		}
		return nil
	}
}

func scheduledJobTime(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}

func buildScheduledJobAgent(daemonWSEndpoint string) nodesystem.ScheduledJobExecutorAgent {
	return func(ctx context.Context, claim nodesystem.LocalSchedulerClaimResult) (nodesystem.ScheduledRunOutboxResult, error) {
		output, err := nodesystem.RunAgent(ctx, claim.Agent, claim.Prompt, claim.Model, claim.ProjectPath, daemonWSEndpoint)
		if err != nil {
			return nodesystem.ScheduledRunOutboxResult{ResponseBody: truncateScheduledJobResponseBody(output)}, err
		}
		return nodesystem.ScheduledRunOutboxResult{Status: "succeeded", ResponseBody: truncateScheduledJobResponseBody(output)}, nil
	}
}

func truncateScheduledJobResponseBody(output string) string {
	normalizedOutput := strings.ToValidUTF8(output, "�")
	codeUnits := 0
	for index, character := range normalizedOutput {
		characterCodeUnits := 1
		if character > 0xFFFF {
			characterCodeUnits = 2
		}
		if codeUnits+characterCodeUnits > scheduledJobResponseBodyMaxLength {
			return normalizedOutput[:index]
		}
		codeUnits += characterCodeUnits
	}
	return normalizedOutput
}
