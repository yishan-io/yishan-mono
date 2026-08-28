package backgroundjob

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog/log"
)

// RecoverRunning durably interrupts local jobs that were running before daemon startup.
func (s *Service) RecoverRunning(ctx context.Context) error {
	if !s.enter() {
		return errServiceClosed
	}
	defer s.waitGroup.Done()
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	jobs, err := s.repository.ListForStartupRecovery(operationCtx)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if !s.isLocalJob(job) || job.Status != StatusRunning {
			continue
		}
		if _, _, err := s.transition(operationCtx, job.ID, StatusRunning, StatusInterrupted, Outcome{ErrorCode: failureCodeRuntime, ErrorMessage: interruptedMessage}); err != nil {
			return fmt.Errorf("interrupt recovered job %s: %w", job.ID, err)
		}
	}
	return nil
}

// RecoverQueued schedules persisted local queued jobs after DSH becomes ready.
func (s *Service) RecoverQueued(ctx context.Context) error {
	if !s.enter() {
		return errServiceClosed
	}
	defer s.waitGroup.Done()
	operationCtx, cancel := s.operationContext(ctx)
	defer cancel()
	jobs, err := s.repository.ListForStartupRecovery(operationCtx)
	if err != nil {
		return err
	}
	jobIDs := queuedLocalJobIDs(s, jobs)
	s.scheduleQueuedRecovery(jobIDs)
	return nil
}

func queuedLocalJobIDs(service *Service, jobs []Job) []string {
	jobIDs := make([]string, 0, len(jobs))
	for _, job := range jobs {
		if service.isLocalJob(job) && job.Status == StatusQueued {
			jobIDs = append(jobIDs, job.ID)
		}
	}
	return jobIDs
}

// Schedule attempts to queue a local durable job without blocking its caller.
// If the bounded scheduler is full, the persisted queued job is admitted after another run completes.
func (s *Service) Schedule(ctx context.Context, jobID string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if !s.startScheduler() {
		return errServiceClosed
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosed {
		return errServiceClosed
	}
	if s.scheduled[jobID] {
		return nil
	}
	select {
	case s.schedulerJobs <- jobID:
		s.scheduled[jobID] = true
		return nil
	default:
		return errSchedulerFull
	}
}

func (s *Service) startScheduler() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.isClosed {
		return false
	}
	s.schedulerOnce.Do(func() {
		for range queuedRecoveryWorkerLimit {
			s.schedulerWaitGroup.Add(1)
			go s.runScheduledJobs()
		}
	})
	return true
}

func (s *Service) runScheduledJobs() {
	defer s.schedulerWaitGroup.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case jobID := <-s.schedulerJobs:
			s.Run(s.ctx, jobID)
			s.releaseScheduled(jobID)
			s.retryScheduledJobs()
		}
	}
}

func (s *Service) releaseScheduled(jobID string) {
	s.mu.Lock()
	delete(s.scheduled, jobID)
	s.mu.Unlock()
}

func (s *Service) retryScheduledJobs() {
	jobs, err := s.repository.ListForStartupRecovery(s.ctx)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			log.Error().Err(err).Msg("list queued background jobs for scheduler retry")
		}
		return
	}
	s.scheduleQueuedRecovery(queuedLocalJobIDs(s, jobs))
}

func (s *Service) scheduleQueuedRecovery(jobIDs []string) {
	for _, jobID := range jobIDs {
		if err := s.Schedule(s.ctx, jobID); err != nil {
			return
		}
	}
}
