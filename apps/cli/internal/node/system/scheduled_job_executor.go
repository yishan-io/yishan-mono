package system

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"
)

const (
	scheduledJobExecutorFailedStatus          = "failed"
	scheduledJobExecutorPathMissingCode       = "PROJECT_PATH_MISSING"
	scheduledJobExecutorPathMissingMessage    = "scheduled job project path is missing"
	scheduledJobExecutorPathAbsentCode        = "PROJECT_PATH_NOT_FOUND"
	scheduledJobExecutorPathAbsentMessage     = "scheduled job project path does not exist"
	scheduledJobExecutorAgentFailedCode       = "AGENT_EXECUTION_FAILED"
	scheduledJobExecutorAgentFailedMessage    = "scheduled job agent execution failed"
	scheduledJobExecutorResponseBodyMaxLength = 4096
	scheduledJobExecutorErrorMessageMaxLength = 1000
)

var (
	errScheduledJobExecutorCallbacks         = errors.New("scheduled job executor requires store, start, complete, and agent callbacks")
	errScheduledJobExecutorNodeID            = errors.New("scheduled job executor requires a node ID")
	errScheduledJobExecutorClaimNotSaved     = errors.New("scheduled job claim was not saved")
	errScheduledJobExecutorStartNotMarked    = errors.New("scheduled job start was not saved")
	errScheduledJobExecutorResultNotSaved    = errors.New("scheduled job result was not saved")
	errScheduledJobExecutorDeliveryNotMarked = errors.New("scheduled job delivery acknowledgement was not saved")
)

// ScheduledJobExecutorStore persists a run before execution and its delivery state afterwards.
type ScheduledJobExecutorStore interface {
	SaveClaim(context.Context, ScheduledRunOutboxRow) (bool, error)
	MarkStarted(context.Context, string, time.Time) (bool, error)
	SaveResult(context.Context, string, ScheduledRunOutboxResult, time.Time) (bool, error)
	MarkDelivered(context.Context, string, time.Time) (bool, error)
}

// ScheduledJobExecutorStart marks a run started in the authoritative API.
type ScheduledJobExecutorStart func(context.Context, string, string, time.Time) error

// ScheduledJobExecutorComplete acknowledges a persisted terminal result in the authoritative API.
type ScheduledJobExecutorComplete func(context.Context, string, ScheduledRunOutboxRow, time.Time) error

// ScheduledJobExecutorAgent runs the claimed job after it has been durably started.
type ScheduledJobExecutorAgent func(context.Context, LocalSchedulerClaimResult) (ScheduledRunOutboxResult, error)

// ScheduledJobExecutorOptions configures a locally durable scheduled-job executor.
type ScheduledJobExecutorOptions struct {
	Store           ScheduledJobExecutorStore
	NodeID          string
	Start           ScheduledJobExecutorStart
	Complete        ScheduledJobExecutorComplete
	Agent           ScheduledJobExecutorAgent
	IsStartRejected ScheduledRunOutboxStartRejected
	Now             func() time.Time
}

// ScheduledJobExecutor runs claims with durable outbox ordering.
type ScheduledJobExecutor struct {
	store           ScheduledJobExecutorStore
	nodeID          string
	start           ScheduledJobExecutorStart
	complete        ScheduledJobExecutorComplete
	agent           ScheduledJobExecutorAgent
	isStartRejected ScheduledRunOutboxStartRejected
	now             func() time.Time
}

// NewScheduledJobExecutor constructs an executor with all external work injected.
func NewScheduledJobExecutor(options ScheduledJobExecutorOptions) (*ScheduledJobExecutor, error) {
	if options.Store == nil || options.Start == nil || options.Complete == nil || options.Agent == nil {
		return nil, errScheduledJobExecutorCallbacks
	}
	options.NodeID = strings.TrimSpace(options.NodeID)
	if options.NodeID == "" {
		return nil, errScheduledJobExecutorNodeID
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	return &ScheduledJobExecutor{store: options.Store, nodeID: options.NodeID, start: options.Start,
		complete: options.Complete, agent: options.Agent, isStartRejected: scheduledRunOutboxStartRejected(options.IsStartRejected), now: options.Now}, nil
}

// Execute runs one API-claimed occurrence. Unsaved rows are left for recovery.
func (e *ScheduledJobExecutor) Execute(ctx context.Context, claim LocalSchedulerClaimResult) error {
	row := e.claimRow(claim)
	if err := e.saveClaim(ctx, row); err != nil {
		return err
	}
	isStartRejected, err := e.startRun(ctx, row)
	if err != nil {
		return err
	}
	if isStartRejected {
		return e.saveRejectedAndMarkDelivered(ctx, row)
	}
	result := normalizeScheduledJobExecutorResult(e.runAgent(ctx, claim))
	return e.saveAndDeliver(ctx, row, result)
}

func (e *ScheduledJobExecutor) claimRow(claim LocalSchedulerClaimResult) ScheduledRunOutboxRow {
	return ScheduledRunOutboxRow{RunID: claim.RunID, JobID: claim.JobID, NodeID: e.nodeID,
		ScheduledFor: claim.ScheduledFor, State: ScheduledRunOutboxStateClaimed}
}

func (e *ScheduledJobExecutor) saveClaim(ctx context.Context, row ScheduledRunOutboxRow) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	applied, err := e.store.SaveClaim(ctx, row)
	if err != nil {
		return err
	}
	if !applied {
		return errScheduledJobExecutorClaimNotSaved
	}
	return nil
}

func (e *ScheduledJobExecutor) startRun(ctx context.Context, row ScheduledRunOutboxRow) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	if err := e.start(ctx, e.nodeID, row.RunID, e.now().UTC()); err != nil {
		if e.isStartRejected(err) {
			return true, nil
		}
		return false, err
	}
	if err := ctx.Err(); err != nil {
		return false, err
	}
	applied, err := e.store.MarkStarted(ctx, row.RunID, e.now().UTC())
	if err != nil {
		return false, err
	}
	if !applied {
		return false, errScheduledJobExecutorStartNotMarked
	}
	return false, nil
}

func (e *ScheduledJobExecutor) runAgent(ctx context.Context, claim LocalSchedulerClaimResult) ScheduledRunOutboxResult {
	if ctx.Err() != nil {
		return scheduledJobExecutorFailure(scheduledJobExecutorAgentFailedCode, scheduledJobExecutorAgentFailedMessage)
	}
	if result, ok := scheduledJobExecutorPathFailure(claim.ProjectPath); ok {
		return result
	}
	result, err := e.agent(ctx, claim)
	if err != nil {
		return ScheduledRunOutboxResult{Status: scheduledJobExecutorFailedStatus, ResponseBody: result.ResponseBody,
			ErrorCode: scheduledJobExecutorAgentFailedCode, ErrorMessage: err.Error()}
	}
	return result
}

func scheduledJobExecutorPathFailure(projectPath string) (ScheduledRunOutboxResult, bool) {
	if strings.TrimSpace(projectPath) == "" {
		return scheduledJobExecutorFailure(scheduledJobExecutorPathMissingCode, scheduledJobExecutorPathMissingMessage), true
	}
	if _, err := os.Stat(projectPath); errors.Is(err, os.ErrNotExist) {
		return scheduledJobExecutorFailure(scheduledJobExecutorPathAbsentCode, scheduledJobExecutorPathAbsentMessage), true
	}
	return ScheduledRunOutboxResult{}, false
}

func normalizeScheduledJobExecutorResult(result ScheduledRunOutboxResult) ScheduledRunOutboxResult {
	result.ResponseBody = truncateScheduledJobExecutorText(result.ResponseBody, scheduledJobExecutorResponseBodyMaxLength)
	result.ErrorMessage = truncateScheduledJobExecutorText(result.ErrorMessage, scheduledJobExecutorErrorMessageMaxLength)
	return result
}

func truncateScheduledJobExecutorText(text string, maxCodeUnits int) string {
	normalizedText := strings.ToValidUTF8(text, "�")
	codeUnits := 0
	for index, character := range normalizedText {
		characterCodeUnits := 1
		if character > 0xFFFF {
			characterCodeUnits = 2
		}
		if codeUnits+characterCodeUnits > maxCodeUnits {
			return normalizedText[:index]
		}
		codeUnits += characterCodeUnits
	}
	return normalizedText
}

func scheduledJobExecutorFailure(code, message string) ScheduledRunOutboxResult {
	return ScheduledRunOutboxResult{Status: scheduledJobExecutorFailedStatus, ErrorCode: code, ErrorMessage: message}
}

func (e *ScheduledJobExecutor) saveRejectedAndMarkDelivered(ctx context.Context, row ScheduledRunOutboxRow) error {
	if err := e.saveResult(ctx, row.RunID, scheduledRunOutboxStartRejectedResult()); err != nil {
		return err
	}
	return e.markDelivered(ctx, row.RunID)
}

func (e *ScheduledJobExecutor) saveAndDeliver(ctx context.Context, row ScheduledRunOutboxRow, result ScheduledRunOutboxResult) error {
	if err := e.saveResult(ctx, row.RunID, result); err != nil {
		return err
	}
	row.State, row.Result = ScheduledRunOutboxStateFinished, result
	return e.completeAndMarkDelivered(ctx, row)
}

func (e *ScheduledJobExecutor) saveResult(ctx context.Context, runID string, result ScheduledRunOutboxResult) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	applied, err := e.store.SaveResult(ctx, runID, result, e.now().UTC())
	if err != nil {
		return err
	}
	if !applied {
		return errScheduledJobExecutorResultNotSaved
	}
	return nil
}

func (e *ScheduledJobExecutor) markDelivered(ctx context.Context, runID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	applied, err := e.store.MarkDelivered(ctx, runID, e.now().UTC())
	if err != nil {
		return err
	}
	if !applied {
		return errScheduledJobExecutorDeliveryNotMarked
	}
	return nil
}

func (e *ScheduledJobExecutor) completeAndMarkDelivered(ctx context.Context, row ScheduledRunOutboxRow) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := e.complete(ctx, e.nodeID, row, e.now().UTC()); err != nil {
		return err
	}
	return e.markDelivered(ctx, row.RunID)
}
