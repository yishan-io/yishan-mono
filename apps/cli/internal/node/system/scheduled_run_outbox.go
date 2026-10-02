package system

import (
	"context"
	"errors"
	"time"
)

const (
	// ScheduledRunOutboxDaemonInterruptedCode is the terminal error for runs left active by a prior daemon.
	ScheduledRunOutboxDaemonInterruptedCode = "DAEMON_INTERRUPTED"
	// ScheduledRunOutboxStartRejectedCode identifies a terminal local result for an API-rejected start.
	ScheduledRunOutboxStartRejectedCode   = "SCHEDULED_JOB_RUN_START_REJECTED"
	scheduledRunOutboxFailureStatus       = "failed"
	scheduledRunOutboxRejectedStatus      = "rejected"
	scheduledRunOutboxInterruptedMessage  = "daemon interrupted before scheduled job run completed"
	defaultScheduledRunOutboxRetryInitial = time.Second
	defaultScheduledRunOutboxRetryMax     = time.Minute
)

var errScheduledRunOutboxCallbacks = errors.New("scheduled run outbox requires store, start, and complete callbacks")

// ScheduledRunOutboxState describes the local durable lifecycle of a scheduled run.
type ScheduledRunOutboxState string

const (
	ScheduledRunOutboxStateClaimed  ScheduledRunOutboxState = "claimed"
	ScheduledRunOutboxStateStarted  ScheduledRunOutboxState = "started"
	ScheduledRunOutboxStateFinished ScheduledRunOutboxState = "finished"
)

// ScheduledRunOutboxResult is the terminal result retained until cloud delivery succeeds.
type ScheduledRunOutboxResult struct {
	Status       string
	ResponseBody string
	ErrorCode    string
	ErrorMessage string
}

// ScheduledRunOutboxRow is one locally persisted scheduled run.
type ScheduledRunOutboxRow struct {
	RunID        string
	JobID        string
	NodeID       string
	ScheduledFor time.Time
	State        ScheduledRunOutboxState
	Result       ScheduledRunOutboxResult
	UpdatedAt    time.Time
}

// ScheduledRunOutboxStore persists scheduled run state independently of this runner.
type ScheduledRunOutboxStore interface {
	ListUndelivered(context.Context) ([]ScheduledRunOutboxRow, error)
	SaveResult(context.Context, string, ScheduledRunOutboxResult, time.Time) (bool, error)
	MarkDelivered(context.Context, string, time.Time) (bool, error)
}

// ScheduledRunOutboxStart idempotently records that a run started in the cloud.
type ScheduledRunOutboxStart func(context.Context, ScheduledRunOutboxRow, time.Time) error

// ScheduledRunOutboxComplete idempotently delivers a terminal result to the cloud.
type ScheduledRunOutboxComplete func(context.Context, ScheduledRunOutboxRow, time.Time) error

// ScheduledRunOutboxRetryable reports whether an operation error can be retried.
type ScheduledRunOutboxRetryable func(error) bool

// ScheduledRunOutboxStartRejected reports whether the authoritative API rejected a run start.
type ScheduledRunOutboxStartRejected func(error) bool

// ScheduledRunOutboxRunnerOptions configures restart recovery and result delivery.
type ScheduledRunOutboxRunnerOptions struct {
	Store           ScheduledRunOutboxStore
	Start           ScheduledRunOutboxStart
	Complete        ScheduledRunOutboxComplete
	IsRetryable     ScheduledRunOutboxRetryable
	IsStartRejected ScheduledRunOutboxStartRejected
	Now             func() time.Time
	RetryInitial    time.Duration
	RetryMax        time.Duration
}

// ScheduledRunOutboxRunner recovers interrupted runs without starting any subprocesses.
type ScheduledRunOutboxRunner struct {
	store           ScheduledRunOutboxStore
	start           ScheduledRunOutboxStart
	complete        ScheduledRunOutboxComplete
	isRetryable     ScheduledRunOutboxRetryable
	isStartRejected ScheduledRunOutboxStartRejected
	now             func() time.Time
	retryInitial    time.Duration
	retryMax        time.Duration
}

// NewScheduledRunOutboxRunner constructs a context-bound recovery runner.
func NewScheduledRunOutboxRunner(options ScheduledRunOutboxRunnerOptions) (*ScheduledRunOutboxRunner, error) {
	if options.Store == nil || options.Start == nil || options.Complete == nil {
		return nil, errScheduledRunOutboxCallbacks
	}
	retryInitial, retryMax := scheduledRunOutboxRetryOptions(options)
	return &ScheduledRunOutboxRunner{store: options.Store, start: options.Start, complete: options.Complete,
		isRetryable:     scheduledRunOutboxRetryable(options.IsRetryable),
		isStartRejected: scheduledRunOutboxStartRejected(options.IsStartRejected), now: scheduledRunOutboxNow(options.Now),
		retryInitial: retryInitial, retryMax: retryMax}, nil
}

func scheduledRunOutboxRetryOptions(options ScheduledRunOutboxRunnerOptions) (time.Duration, time.Duration) {
	retryMax := scheduledRunOutboxRetry(options.RetryMax, defaultScheduledRunOutboxRetryMax)
	retryInitial := scheduledRunOutboxRetry(options.RetryInitial, defaultScheduledRunOutboxRetryInitial)
	return min(retryInitial, retryMax), retryMax
}

func scheduledRunOutboxRetryable(isRetryable ScheduledRunOutboxRetryable) ScheduledRunOutboxRetryable {
	if isRetryable != nil {
		return isRetryable
	}
	return func(err error) bool {
		return !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded)
	}
}

func scheduledRunOutboxStartRejected(isStartRejected ScheduledRunOutboxStartRejected) ScheduledRunOutboxStartRejected {
	if isStartRejected != nil {
		return isStartRejected
	}
	return func(error) bool { return false }
}

func scheduledRunOutboxNow(now func() time.Time) func() time.Time {
	if now == nil {
		return time.Now
	}
	return now
}

func scheduledRunOutboxRetry(value, fallback time.Duration) time.Duration {
	if value <= 0 {
		return fallback
	}
	return value
}

// Recover reports all locally undelivered runs, retrying delivery until ctx is canceled.
func (r *ScheduledRunOutboxRunner) Recover(ctx context.Context) error {
	return r.RecoverEligible(ctx, func(ScheduledRunOutboxRow) bool { return true })
}

// RecoverEligible recovers locally undelivered runs selected by eligible.
func (r *ScheduledRunOutboxRunner) RecoverEligible(ctx context.Context, eligible func(ScheduledRunOutboxRow) bool) error {
	if eligible == nil {
		eligible = func(ScheduledRunOutboxRow) bool { return true }
	}
	rows, err := r.store.ListUndelivered(ctx)
	if err != nil {
		return err
	}
	var recoveryErrors []error
	for _, row := range rows {
		if err := ctx.Err(); err != nil {
			return errors.Join(append(recoveryErrors, err)...)
		}
		if !eligible(row) {
			continue
		}
		if err := r.recoverRow(ctx, row); err != nil {
			recoveryErrors = append(recoveryErrors, err)
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return errors.Join(recoveryErrors...)
			}
		}
	}
	return errors.Join(recoveryErrors...)
}

func (r *ScheduledRunOutboxRunner) recoverRow(ctx context.Context, row ScheduledRunOutboxRow) error {
	if row.State == ScheduledRunOutboxStateFinished {
		if isScheduledRunOutboxRejected(row.Result) {
			return r.markDeliveredUntilAcknowledged(ctx, row)
		}
		return r.deliverUntilAcknowledged(ctx, row)
	}
	if row.State != ScheduledRunOutboxStateClaimed && row.State != ScheduledRunOutboxStateStarted {
		return nil
	}
	return r.finalizeInterruptedRun(ctx, row)
}

func (r *ScheduledRunOutboxRunner) finalizeInterruptedRun(ctx context.Context, row ScheduledRunOutboxRow) error {
	isStartRejected, err := r.startUntilAccepted(ctx, row)
	if err != nil {
		return err
	}
	if isStartRejected {
		return r.saveRejectedAndAcknowledge(ctx, row)
	}
	result := ScheduledRunOutboxResult{Status: scheduledRunOutboxFailureStatus, ErrorCode: ScheduledRunOutboxDaemonInterruptedCode,
		ErrorMessage: scheduledRunOutboxInterruptedMessage}
	if err := r.saveResult(ctx, row.RunID, result); err != nil {
		return err
	}
	row.State, row.Result = ScheduledRunOutboxStateFinished, result
	return r.deliverUntilAcknowledged(ctx, row)
}

func (r *ScheduledRunOutboxRunner) startUntilAccepted(ctx context.Context, row ScheduledRunOutboxRow) (bool, error) {
	isStartRejected := false
	err := r.retry(ctx, func() error {
		err := r.start(ctx, row, r.now().UTC())
		if r.isStartRejected(err) {
			isStartRejected = true
			return nil
		}
		return err
	})
	return isStartRejected, err
}

func (r *ScheduledRunOutboxRunner) saveRejectedAndAcknowledge(ctx context.Context, row ScheduledRunOutboxRow) error {
	result := scheduledRunOutboxStartRejectedResult()
	if err := r.saveResult(ctx, row.RunID, result); err != nil {
		return err
	}
	row.State, row.Result = ScheduledRunOutboxStateFinished, result
	return r.markDeliveredUntilAcknowledged(ctx, row)
}

func scheduledRunOutboxStartRejectedResult() ScheduledRunOutboxResult {
	return ScheduledRunOutboxResult{Status: scheduledRunOutboxRejectedStatus, ErrorCode: ScheduledRunOutboxStartRejectedCode}
}

func isScheduledRunOutboxRejected(result ScheduledRunOutboxResult) bool {
	return result.Status == scheduledRunOutboxRejectedStatus
}

func (r *ScheduledRunOutboxRunner) saveResult(ctx context.Context, runID string, result ScheduledRunOutboxResult) error {
	return r.retry(ctx, func() error {
		applied, err := r.store.SaveResult(ctx, runID, result, r.now().UTC())
		if err != nil || applied {
			return err
		}
		return errors.New("scheduled run result was not saved")
	})
}

func (r *ScheduledRunOutboxRunner) deliverUntilAcknowledged(ctx context.Context, row ScheduledRunOutboxRow) error {
	return r.retry(ctx, func() error {
		if err := r.complete(ctx, row, r.now().UTC()); err != nil {
			return err
		}
		return r.markDelivered(ctx, row.RunID)
	})
}

func (r *ScheduledRunOutboxRunner) markDeliveredUntilAcknowledged(ctx context.Context, row ScheduledRunOutboxRow) error {
	return r.retry(ctx, func() error { return r.markDelivered(ctx, row.RunID) })
}

func (r *ScheduledRunOutboxRunner) markDelivered(ctx context.Context, runID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	applied, err := r.store.MarkDelivered(ctx, runID, r.now().UTC())
	if err != nil || applied {
		return err
	}
	return errors.New("scheduled run delivery acknowledgement was not saved")
}

func (r *ScheduledRunOutboxRunner) retry(ctx context.Context, operation func() error) error {
	delay := r.retryInitial
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := operation(); err == nil {
			return ctx.Err()
		} else if !r.isRetryable(err) {
			return err
		}
		if err := r.wait(ctx, delay); err != nil {
			return err
		}
		delay = r.nextRetryDelay(delay)
	}
}

func (r *ScheduledRunOutboxRunner) wait(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (r *ScheduledRunOutboxRunner) nextRetryDelay(delay time.Duration) time.Duration {
	if delay >= r.retryMax || delay > r.retryMax/2 {
		return r.retryMax
	}
	return delay * 2
}
