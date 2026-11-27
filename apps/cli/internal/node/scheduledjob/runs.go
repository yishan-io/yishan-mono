package scheduledjob

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
	domain "yishan/apps/cli/internal/scheduledjob"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

const (
	defaultRunListLimit = 20
	maxRunListLimit     = 100
	maxResponseBody     = 4096
	maxErrorMessage     = 1000

	errorCodePathMissing  = "PROJECT_PATH_MISSING"
	errorCodePathNotFound = "PROJECT_PATH_NOT_FOUND"
	errorCodeAgentFailed  = "AGENT_EXECUTION_FAILED"
)

// Claim is one run ready to execute.
type Claim struct {
	JobID        string
	RunID        string
	ScheduledFor time.Time
	AgentKind    string
	Prompt       string
	Model        string
	ProjectPath  string
	NextRunAt    time.Time
}

// ListRuns returns a job's recent runs.
func (s *Service) ListRuns(ctx context.Context, req rpc.ScheduledJobListRunsParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	limit := req.Limit
	if limit <= 0 {
		limit = defaultRunListLimit
	}
	return s.store().ListRuns(ctx, job.ID, min(limit, maxRunListLimit))
}

// RunNow records a manual run and starts it in the background. Paused jobs
// can still be run manually.
func (s *Service) RunNow(ctx context.Context, req rpc.ScheduledJobRefParams) (any, error) {
	job, err := s.ownedJob(ctx, req.OrganizationID, req.JobID)
	if err != nil {
		return nil, err
	}
	if s.deps.LaunchRun == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "the scheduled job runner is not available")
	}
	now := s.now()
	run := sqlite.NewPendingRun(job, uuid.Must(uuid.NewV7()).String(), domain.FormatTime(now), domain.TriggerManual, now)
	if err := s.store().CreateRun(ctx, run); err != nil {
		return nil, err
	}
	s.deps.LaunchRun(s.claimFor(ctx, job, run.ID, now))
	return map[string]any{"ok": true, "run": run}, nil
}

func (s *Service) claimFor(ctx context.Context, job domain.Job, runID string, scheduledFor time.Time) Claim {
	nextRunAt, _ := domain.ParseTime(job.NextRunAt)
	claim := Claim{JobID: job.ID, RunID: runID, ScheduledFor: scheduledFor, AgentKind: job.AgentKind, Prompt: job.Prompt,
		ProjectPath: s.projectPath(ctx, job.ProjectID), NextRunAt: nextRunAt}
	if job.Model != nil {
		claim.Model = *job.Model
	}
	return claim
}

// projectPath returns the project's primary checkout on this node.
func (s *Service) projectPath(ctx context.Context, projectID string) string {
	primary, found, err := sqlite.NewProjectStore(s.deps.Database).PrimaryWorkspace(ctx, projectID, s.deps.NodeID)
	if err != nil || !found {
		return ""
	}
	return primary.LocalPath
}

// Execute runs a claimed occurrence to completion and records its result.
// A run that is no longer pending (already started elsewhere) is skipped.
func (s *Service) Execute(ctx context.Context, claim Claim) {
	started, err := s.store().MarkRunStarted(ctx, claim.RunID, s.now())
	if err != nil || !started {
		if err != nil {
			log.Warn().Err(err).Str("runId", claim.RunID).Msg("start scheduled job run failed")
		}
		return
	}
	result := normalizeResult(s.runAgent(ctx, claim))
	// Record the result even when ctx was canceled mid-run.
	if err := s.store().CompleteRun(context.WithoutCancel(ctx), claim.RunID, result, s.now()); err != nil {
		log.Warn().Err(err).Str("runId", claim.RunID).Msg("record scheduled job run result failed")
	}
}

func (s *Service) runAgent(ctx context.Context, claim Claim) domain.Result {
	if strings.TrimSpace(claim.ProjectPath) == "" {
		return failure(errorCodePathMissing, "scheduled job project path is missing")
	}
	if _, err := os.Stat(claim.ProjectPath); errors.Is(err, os.ErrNotExist) {
		return failure(errorCodePathNotFound, "scheduled job project path does not exist")
	}
	output, err := s.deps.RunAgent(ctx, claim.AgentKind, claim.Prompt, claim.Model, claim.ProjectPath)
	if err != nil {
		result := failure(errorCodeAgentFailed, err.Error())
		result.ResponseBody = output
		return result
	}
	return domain.Result{Status: domain.RunSucceeded, ResponseBody: output}
}

// Recover fails runs a previous daemon process left unfinished.
func (s *Service) Recover(ctx context.Context) error {
	return s.store().InterruptUnfinishedRuns(ctx, s.deps.NodeID, s.now())
}

func failure(code string, message string) domain.Result {
	return domain.Result{Status: domain.RunFailed, ErrorCode: code, ErrorMessage: message}
}

func normalizeResult(result domain.Result) domain.Result {
	result.ResponseBody = truncateUTF16(result.ResponseBody, maxResponseBody)
	result.ErrorMessage = truncateUTF16(result.ErrorMessage, maxErrorMessage)
	return result
}

// truncateUTF16 keeps at most maxCodeUnits UTF-16 code units, the unit the
// desktop and the previous api-service limits count in.
func truncateUTF16(text string, maxCodeUnits int) string {
	normalized := strings.ToValidUTF8(text, "�")
	codeUnits := 0
	for index, character := range normalized {
		width := 1
		if character > 0xFFFF {
			width = 2
		}
		if codeUnits+width > maxCodeUnits {
			return normalized[:index]
		}
		codeUnits += width
	}
	return normalized
}
