package app

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	nodesystem "yishan/apps/cli/internal/node/system"
)

var (
	errScheduledJobsDisabled = errors.New("scheduled jobs runtime is disabled")
	errScheduledJobsWaiting  = errors.New("scheduled jobs runtime is waiting for API credentials")
)

const (
	scheduledJobsRecoveryRetryInitial = time.Second
	scheduledJobsRecoveryRetryMax     = time.Minute
	scheduledJobsOutboxRetryInterval  = 5 * time.Minute
)

type scheduledJobsState uint8

const (
	scheduledJobsWaiting scheduledJobsState = iota
	scheduledJobsRecovering
	scheduledJobsEnabled
)

// scheduledJobsRuntime owns recovery-gated scheduled-job lifecycle.
// It never lets the scheduler use cloud callbacks until durable outbox recovery
// has completed successfully.
type scheduledJobsRuntime struct {
	scheduler        *nodesystem.LocalScheduler
	outbox           *sqlite.ScheduledJobRunOutboxStore
	outboxRunner     *nodesystem.ScheduledRunOutboxRunner
	snapshot         nodesystem.LocalSchedulerSnapshot
	claim            nodesystem.LocalSchedulerClaim
	execute          nodesystem.LocalSchedulerExecute
	isEnabled        bool
	session          *session.Session
	nodeID           string
	daemonWSEndpoint string

	ctx              context.Context
	cancel           context.CancelFunc
	refreshRequests  chan struct{}
	recoveryRequests chan struct{}
	outboxRequests   chan struct{}
	activeRunIDs     map[string]struct{}
	refreshWG        sync.WaitGroup
	closeOnce        sync.Once
	closeDone        chan struct{}
	lifecycleMu      sync.Mutex
	state            scheduledJobsState
	started          bool
	closed           bool
}

func newDisabledScheduledJobs(database *sql.DB) (*scheduledJobsRuntime, error) {
	outbox := sqlite.NewScheduledJobRunOutboxStore(database)
	outboxRunner, err := nodesystem.NewScheduledRunOutboxRunner(nodesystem.ScheduledRunOutboxRunnerOptions{
		Store: scheduledRunOutboxStore{store: outbox}, Start: disabledScheduledRunOutboxStart, Complete: disabledScheduledRunOutboxComplete,
	})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &scheduledJobsRuntime{outbox: outbox, outboxRunner: outboxRunner, snapshot: disabledScheduledJobsSnapshot,
		claim: disabledScheduledJobsClaim, execute: func(context.Context, nodesystem.LocalSchedulerClaimResult) {},
		ctx: ctx, cancel: cancel, refreshRequests: make(chan struct{}, 1), recoveryRequests: make(chan struct{}, 1), outboxRequests: make(chan struct{}, 1), activeRunIDs: make(map[string]struct{}),
		closeDone: make(chan struct{}), state: scheduledJobsEnabled, isEnabled: true}, nil
}

// newScheduledJobs composes a recovery-gated runtime. API access is resolved
// by its worker so Bootstrap remains local and cannot block on cloud I/O.
func newScheduledJobs(database *sql.DB, sessionValue *session.Session, nodeID, daemonWSEndpoint string) (*scheduledJobsRuntime, error) {
	ctx, cancel := context.WithCancel(context.Background())
	return &scheduledJobsRuntime{outbox: sqlite.NewScheduledJobRunOutboxStore(database), session: sessionValue, nodeID: nodeID,
		daemonWSEndpoint: daemonWSEndpoint, ctx: ctx, cancel: cancel, refreshRequests: make(chan struct{}, 1),
		recoveryRequests: make(chan struct{}, 1), outboxRequests: make(chan struct{}, 1), activeRunIDs: make(map[string]struct{}), closeDone: make(chan struct{}), state: scheduledJobsWaiting}, nil
}

func (r *scheduledJobsRuntime) buildEnabledComponents() (*nodesystem.LocalScheduler, *nodesystem.ScheduledRunOutboxRunner, error) {
	if r.session == nil || !r.session.APIConfigured() {
		return nil, nil, errScheduledJobsWaiting
	}
	adapters, err := newScheduledJobCloudAdapters(r.session.APIClient(), r.nodeID)
	if err != nil {
		return nil, nil, err
	}
	store := scheduledRunOutboxStore{store: r.outbox}
	runner, err := nodesystem.NewScheduledRunOutboxRunner(nodesystem.ScheduledRunOutboxRunnerOptions{
		Store: store, Start: adapters.start, Complete: adapters.complete, IsRetryable: cloud.IsScheduledJobRunRetryable,
		IsStartRejected: isScheduledJobStartRejected,
	})
	if err != nil {
		return nil, nil, err
	}
	executor, err := r.newScheduledJobExecutor(store, adapters)
	if err != nil {
		return nil, nil, err
	}
	scheduler, err := r.newScheduledJobScheduler(adapters, executor)
	if err != nil {
		return nil, nil, err
	}
	return scheduler, runner, nil
}

func (r *scheduledJobsRuntime) newScheduledJobExecutor(store scheduledRunOutboxStore, adapters scheduledJobCloudAdapters) (*nodesystem.ScheduledJobExecutor, error) {
	return nodesystem.NewScheduledJobExecutor(nodesystem.ScheduledJobExecutorOptions{
		Store: store, NodeID: r.nodeID, Agent: buildScheduledJobAgent(r.daemonWSEndpoint),
		Start: func(ctx context.Context, _ string, runID string, startedAt time.Time) error {
			return adapters.startFresh(ctx, nodesystem.ScheduledRunOutboxRow{RunID: runID}, startedAt)
		},
		Complete: func(ctx context.Context, _ string, row nodesystem.ScheduledRunOutboxRow, finishedAt time.Time) error {
			return adapters.complete(ctx, row, finishedAt)
		},
		IsStartRejected: isScheduledJobStartRejected,
	})
}

func (r *scheduledJobsRuntime) newScheduledJobScheduler(adapters scheduledJobCloudAdapters, executor *nodesystem.ScheduledJobExecutor) (*nodesystem.LocalScheduler, error) {
	return nodesystem.NewLocalScheduler(nodesystem.LocalSchedulerOptions{
		Snapshot: adapters.reconcile, Claim: adapters.claim,
		Execute: func(ctx context.Context, claim nodesystem.LocalSchedulerClaimResult) {
			r.registerActiveRun(claim.RunID)
			defer r.unregisterActiveRun(claim.RunID)
			if err := executor.Execute(ctx, claim); err != nil && ctx.Err() == nil {
				log.Warn().Err(err).Str("runId", claim.RunID).Msg("scheduled job execution deferred to recovery")
			}
		},
	})
}

func (r *scheduledJobsRuntime) recoverAndEnable() error {
	scheduler, runner, err := r.buildEnabledComponents()
	if err != nil {
		return err
	}
	if err := runner.Recover(r.ctx); err != nil {
		scheduler.Close()
		return err
	}
	if !r.registerRecoveringScheduler(scheduler) {
		scheduler.Close()
		return r.ctx.Err()
	}
	if err := scheduler.Start(); err != nil {
		r.clearRecoveringScheduler(scheduler)
		scheduler.Close()
		return err
	}
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	if r.closed || r.ctx.Err() != nil {
		scheduler.Close()
		return r.ctx.Err()
	}
	r.outboxRunner, r.state, r.isEnabled = runner, scheduledJobsEnabled, true
	r.refreshWG.Add(2)
	go r.runRefreshes()
	go r.runOutboxRetries()
	return nil
}

func (r *scheduledJobsRuntime) registerRecoveringScheduler(scheduler *nodesystem.LocalScheduler) bool {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	if r.closed || r.ctx.Err() != nil {
		return false
	}
	r.scheduler = scheduler
	return true
}

func (r *scheduledJobsRuntime) clearRecoveringScheduler(scheduler *nodesystem.LocalScheduler) {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	if r.scheduler == scheduler {
		r.scheduler = nil
	}
}

func (r *scheduledJobsRuntime) runRecovery() {
	defer r.refreshWG.Done()
	delay := scheduledJobsRecoveryRetryInitial
	for r.waitForRecovery(delay) {
		r.setState(scheduledJobsRecovering)
		err := r.recoverAndEnable()
		if err == nil || r.ctx.Err() != nil {
			return
		}
		r.setState(scheduledJobsWaiting)
		if errors.Is(err, errScheduledJobsWaiting) || !cloud.IsScheduledJobRunRetryable(err) {
			log.Debug().Err(err).Msg("scheduled jobs waiting for reconnect or credentials")
			delay = 0
			continue
		}
		log.Warn().Err(err).Dur("retryAfter", delay).Msg("scheduled jobs recovery deferred")
		delay = nextScheduledJobsRecoveryDelay(delay)
	}
}

func (r *scheduledJobsRuntime) waitForRecovery(delay time.Duration) bool {
	if delay <= 0 {
		select {
		case <-r.ctx.Done():
			return false
		case <-r.recoveryRequests:
			return true
		}
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-r.ctx.Done():
		return false
	case <-r.recoveryRequests:
		return true
	case <-timer.C:
		return true
	}
}

func nextScheduledJobsRecoveryDelay(delay time.Duration) time.Duration {
	if delay <= 0 || delay >= scheduledJobsRecoveryRetryMax/2 {
		return scheduledJobsRecoveryRetryMax
	}
	return delay * 2
}

func (r *scheduledJobsRuntime) setState(state scheduledJobsState) {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	if !r.closed {
		r.state = state
	}
}

func disabledScheduledJobsSnapshot(context.Context, []nodesystem.LocalScheduledJob) ([]nodesystem.LocalScheduledJob, error) {
	return []nodesystem.LocalScheduledJob{}, nil
}

func disabledScheduledJobsClaim(context.Context, string, time.Time) (nodesystem.LocalSchedulerClaimResult, error) {
	return nodesystem.LocalSchedulerClaimResult{}, errScheduledJobsDisabled
}

func disabledScheduledRunOutboxStart(context.Context, nodesystem.ScheduledRunOutboxRow, time.Time) error {
	return errScheduledJobsDisabled
}

func disabledScheduledRunOutboxComplete(context.Context, nodesystem.ScheduledRunOutboxRow, time.Time) error {
	return errScheduledJobsDisabled
}

// Start starts recovery asynchronously. It does not call the API on the
// Bootstrap goroutine and no scheduler exists until recovery succeeds.
func (r *scheduledJobsRuntime) Start() error {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	if r.started || r.closed {
		return nil
	}
	if r.isEnabled {
		scheduler, err := nodesystem.NewLocalScheduler(nodesystem.LocalSchedulerOptions{Snapshot: r.snapshot, Claim: r.claim, Execute: r.execute})
		if err != nil {
			return err
		}
		if err := scheduler.Start(); err != nil {
			scheduler.Close()
			return err
		}
		r.scheduler = scheduler
		r.refreshWG.Add(1)
		go r.runRefreshes()
		r.started = true
		return nil
	}
	r.started = true
	r.refreshWG.Add(1)
	go r.runRecovery()
	r.recoveryRequests <- struct{}{}
	return nil
}

// RequestRefresh coalesces reconnect and invalidation signals. Recovery
// state accepts the signal but never reconciles, claims, or executes jobs.
func (r *scheduledJobsRuntime) RequestRefresh(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}
	r.lifecycleMu.Lock()
	started, closed, state := r.started, r.closed, r.state
	r.lifecycleMu.Unlock()
	if !started || closed {
		return
	}
	requests := r.recoveryRequests
	if state == scheduledJobsEnabled {
		requests = r.refreshRequests
		r.requestOutboxRetry()
	}
	select {
	case <-r.ctx.Done():
	case requests <- struct{}{}:
	default:
	}
}

func (r *scheduledJobsRuntime) runRefreshes() {
	defer r.refreshWG.Done()
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-r.refreshRequests:
			_ = r.scheduler.Refresh()
		}
	}
}

func (r *scheduledJobsRuntime) registerActiveRun(runID string) {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	r.activeRunIDs[runID] = struct{}{}
}

func (r *scheduledJobsRuntime) unregisterActiveRun(runID string) {
	r.lifecycleMu.Lock()
	delete(r.activeRunIDs, runID)
	r.lifecycleMu.Unlock()
	r.requestOutboxRetry()
}

func (r *scheduledJobsRuntime) requestOutboxRetry() {
	select {
	case <-r.ctx.Done():
	case r.outboxRequests <- struct{}{}:
	default:
	}
}

func (r *scheduledJobsRuntime) runOutboxRetries() {
	defer r.refreshWG.Done()
	ticker := time.NewTicker(scheduledJobsOutboxRetryInterval)
	defer ticker.Stop()
	for {
		r.recoverEligibleOutbox()
		select {
		case <-r.ctx.Done():
			return
		case <-r.outboxRequests:
		case <-ticker.C:
		}
	}
}

func (r *scheduledJobsRuntime) recoverEligibleOutbox() {
	r.lifecycleMu.Lock()
	runner := r.outboxRunner
	r.lifecycleMu.Unlock()
	if runner == nil {
		return
	}
	err := runner.RecoverEligible(r.ctx, r.isOutboxRunInactive)
	if err != nil && r.ctx.Err() == nil {
		log.Warn().Err(err).Msg("scheduled job outbox delivery deferred")
	}
}

func (r *scheduledJobsRuntime) isOutboxRunInactive(row nodesystem.ScheduledRunOutboxRow) bool {
	r.lifecycleMu.Lock()
	defer r.lifecycleMu.Unlock()
	_, isActive := r.activeRunIDs[row.RunID]
	return !isActive
}

// Close cancels pending refresh work before the database closes. Concurrent
// callers wait for the same shutdown sequence to complete.
func (r *scheduledJobsRuntime) Close() {
	r.closeOnce.Do(func() {
		r.lifecycleMu.Lock()
		r.closed = true
		scheduler := r.scheduler
		r.lifecycleMu.Unlock()

		r.cancel()
		if scheduler != nil {
			scheduler.Close()
		}
		r.refreshWG.Wait()
		close(r.closeDone)
	})
	<-r.closeDone
}

type scheduledRunOutboxStore struct {
	store *sqlite.ScheduledJobRunOutboxStore
}

func (s scheduledRunOutboxStore) SaveClaim(ctx context.Context, row nodesystem.ScheduledRunOutboxRow) (bool, error) {
	return s.store.SaveClaim(ctx, sqlite.ScheduledJobRunOutboxClaim{RunID: row.RunID, JobID: row.JobID, NodeID: row.NodeID, ScheduledFor: row.ScheduledFor})
}

func (s scheduledRunOutboxStore) MarkStarted(ctx context.Context, runID string, startedAt time.Time) (bool, error) {
	return s.store.MarkStarted(ctx, runID, startedAt)
}

func (s scheduledRunOutboxStore) ListUndelivered(ctx context.Context) ([]nodesystem.ScheduledRunOutboxRow, error) {
	rows, err := s.store.ListUndelivered(ctx)
	if err != nil {
		return nil, err
	}
	outboxRows := make([]nodesystem.ScheduledRunOutboxRow, len(rows))
	for index, row := range rows {
		outboxRows[index] = nodesystem.ScheduledRunOutboxRow{
			RunID: row.RunID, JobID: row.JobID, NodeID: row.NodeID, ScheduledFor: row.ScheduledFor,
			State: nodesystem.ScheduledRunOutboxState(row.State),
			Result: nodesystem.ScheduledRunOutboxResult{
				Status: row.Result.Status, ResponseBody: row.Result.ResponseBody, ErrorCode: row.Result.ErrorCode, ErrorMessage: row.Result.ErrorMessage,
			},
			UpdatedAt: row.UpdatedAt,
		}
	}
	return outboxRows, nil
}

func (s scheduledRunOutboxStore) SaveResult(ctx context.Context, runID string, result nodesystem.ScheduledRunOutboxResult, finishedAt time.Time) (bool, error) {
	return s.store.SaveResult(ctx, runID, sqlite.ScheduledJobRunOutboxResult{
		Status: result.Status, ResponseBody: result.ResponseBody, ErrorCode: result.ErrorCode, ErrorMessage: result.ErrorMessage,
	}, finishedAt)
}

func (s scheduledRunOutboxStore) MarkDelivered(ctx context.Context, runID string, deliveredAt time.Time) (bool, error) {
	return s.store.MarkDelivered(ctx, runID, deliveredAt)
}
