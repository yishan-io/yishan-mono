package app

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	nodescheduledjob "yishan/apps/cli/internal/node/scheduledjob"
	nodesystem "yishan/apps/cli/internal/node/system"
)

// scheduledJobsRuntime owns the local scheduler and the background runs for
// one daemon lifetime. Everything it needs is local, so it starts at once.
type scheduledJobsRuntime struct {
	service   *nodescheduledjob.Service
	scheduler *nodesystem.LocalScheduler

	ctx       context.Context
	cancel    context.CancelFunc
	runs      sync.WaitGroup
	refreshMu sync.Mutex
	closeOnce sync.Once
}

func newScheduledJobs(service *nodescheduledjob.Service) (*scheduledJobsRuntime, error) {
	ctx, cancel := context.WithCancel(context.Background())
	runtime := &scheduledJobsRuntime{service: service, ctx: ctx, cancel: cancel}
	scheduler, err := nodesystem.NewLocalScheduler(nodesystem.LocalSchedulerOptions{
		Snapshot: runtime.snapshot, Claim: runtime.claim, Execute: runtime.execute,
	})
	if err != nil {
		cancel()
		return nil, err
	}
	runtime.scheduler = scheduler
	service.SetRuntime(runtime.requestRefresh, runtime.launchRun)
	return runtime, nil
}

// Start fails runs a previous process left unfinished, arms the scheduler,
// and imports any jobs api-service still holds in the background.
func (r *scheduledJobsRuntime) Start() error {
	if err := r.service.Recover(r.ctx); err != nil {
		log.Warn().Err(err).Msg("recover interrupted scheduled job runs")
	}
	if err := r.scheduler.Start(); err != nil {
		return err
	}
	r.runs.Add(1)
	go func() {
		defer r.runs.Done()
		r.service.ImportFromAPI(r.ctx)
	}()
	return nil
}

// RequestRefresh re-reads the active jobs; ctx is accepted for the relay
// handler signature and is not needed by the local refresh.
func (r *scheduledJobsRuntime) RequestRefresh(context.Context) {
	r.requestRefresh()
}

func (r *scheduledJobsRuntime) requestRefresh() {
	if r.ctx.Err() != nil || !r.refreshMu.TryLock() {
		return
	}
	r.runs.Add(1)
	go func() {
		defer r.runs.Done()
		defer r.refreshMu.Unlock()
		if err := r.scheduler.Refresh(); err != nil {
			log.Warn().Err(err).Msg("refresh scheduled jobs")
		}
	}()
}

// launchRun executes a manual run in the background, bound to the runtime.
func (r *scheduledJobsRuntime) launchRun(claim nodescheduledjob.Claim) {
	if r.ctx.Err() != nil {
		return
	}
	r.runs.Add(1)
	go func() {
		defer r.runs.Done()
		r.service.Execute(r.ctx, claim)
	}()
}

func (r *scheduledJobsRuntime) snapshot(ctx context.Context, protected []nodesystem.LocalScheduledJob) ([]nodesystem.LocalScheduledJob, error) {
	occurrences := make([]nodescheduledjob.ScheduledOccurrence, len(protected))
	for index, job := range protected {
		occurrences[index] = nodescheduledjob.ScheduledOccurrence{JobID: job.ID, NextRunAt: job.NextRunAt}
	}
	active, err := r.service.Snapshot(ctx, occurrences)
	if err != nil {
		return nil, err
	}
	jobs := make([]nodesystem.LocalScheduledJob, len(active))
	for index, occurrence := range active {
		jobs[index] = nodesystem.LocalScheduledJob{ID: occurrence.JobID, Status: "active", NextRunAt: occurrence.NextRunAt}
	}
	return jobs, nil
}

func (r *scheduledJobsRuntime) claim(ctx context.Context, jobID string, expected time.Time) (nodesystem.LocalSchedulerClaimResult, error) {
	claim, err := r.service.ClaimOccurrence(ctx, jobID, expected)
	if err != nil {
		return nodesystem.LocalSchedulerClaimResult{}, err
	}
	return nodesystem.LocalSchedulerClaimResult{JobID: claim.JobID, RunID: claim.RunID, ScheduledFor: claim.ScheduledFor,
		Agent: claim.AgentKind, Prompt: claim.Prompt, Model: claim.Model, ProjectPath: claim.ProjectPath, NextRunAt: claim.NextRunAt}, nil
}

func (r *scheduledJobsRuntime) execute(ctx context.Context, result nodesystem.LocalSchedulerClaimResult) {
	r.service.Execute(ctx, nodescheduledjob.Claim{JobID: result.JobID, RunID: result.RunID, ScheduledFor: result.ScheduledFor,
		AgentKind: result.Agent, Prompt: result.Prompt, Model: result.Model, ProjectPath: result.ProjectPath, NextRunAt: result.NextRunAt})
}

// Close stops the scheduler and waits for in-flight runs; their contexts are
// canceled, so agent processes stop and their runs are recorded as failed.
func (r *scheduledJobsRuntime) Close() {
	r.closeOnce.Do(func() {
		r.cancel()
		r.scheduler.Close()
		r.runs.Wait()
	})
}
