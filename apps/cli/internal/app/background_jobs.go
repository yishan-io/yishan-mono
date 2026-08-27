package app

import (
	"context"
	"fmt"
	"sync"
	"time"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/backgroundjob"
	"yishan/apps/cli/internal/events"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"

	"github.com/rs/zerolog/log"
)

const backgroundJobShutdownTimeout = 5 * time.Second

type backgroundJobRunner interface {
	RecoverRunning(context.Context) error
	RecoverQueued(context.Context) error
	Close(context.Context) error
}

func newBackgroundJobService(cfg Config, workspaces *nodeworkspace.Service, supervisor *dsh.Supervisor, events *eventbus.Hub) *backgroundjob.Service {
	service := backgroundjob.NewService(
		sqlite.NewBackgroundJobStore(cfg.Database), workspaces, dshSessionsFor(supervisor), cfg.NodeID,
		func(job backgroundjob.Job) {
			events.Publish(eventbus.Event{Topic: "backgroundJobChanged", Payload: backgroundjob.PublicJobFrom(job)})
		},
	)
	registerBackgroundJobRecovery(supervisor, service)
	return service
}

func registerBackgroundJobRecovery(supervisor *dsh.Supervisor, jobs backgroundJobRunner) {
	if supervisor == nil || jobs == nil {
		return
	}
	var recovery queuedRecovery
	supervisor.OnReady(func() {
		recovery.recover(jobs)
	})
}

func (a *App) closeBackgroundJobs() error {
	if a.backgroundJobs == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), backgroundJobShutdownTimeout)
	defer cancel()
	if err := a.backgroundJobs.Close(ctx); err != nil {
		log.Error().Err(err).Msg("failed to stop background jobs")
		return fmt.Errorf("stop background jobs: %w", err)
	}
	return nil
}

// queuedRecovery retries after a failed recovery on a later DSH-ready notification.
type queuedRecovery struct {
	mu          sync.Mutex
	isRunning   bool
	isCompleted bool
}

func (r *queuedRecovery) recover(jobs backgroundJobRunner) {
	r.mu.Lock()
	if r.isRunning || r.isCompleted {
		r.mu.Unlock()
		return
	}
	r.isRunning = true
	r.mu.Unlock()

	err := jobs.RecoverQueued(context.Background())
	if err != nil {
		log.Error().Err(err).Msg("recover queued background jobs")
	}

	r.mu.Lock()
	r.isRunning = false
	if err == nil {
		r.isCompleted = true
	}
	r.mu.Unlock()
}
