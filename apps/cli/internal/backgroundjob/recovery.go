package backgroundjob

import (
	"context"
	"fmt"
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

func (s *Service) scheduleQueuedRecovery(jobIDs []string) {
	workers := min(queuedRecoveryWorkerLimit, len(jobIDs))
	if workers == 0 {
		return
	}
	jobs := make(chan string)
	for range workers {
		if !s.enter() {
			close(jobs)
			return
		}
		go s.runQueuedRecoveryWorker(jobs)
	}
	go s.dispatchQueuedRecovery(jobs, jobIDs)
}

func (s *Service) runQueuedRecoveryWorker(jobs <-chan string) {
	defer s.waitGroup.Done()
	for jobID := range jobs {
		s.Run(s.ctx, jobID)
	}
}

func (s *Service) dispatchQueuedRecovery(jobs chan<- string, jobIDs []string) {
	defer close(jobs)
	for _, jobID := range jobIDs {
		select {
		case jobs <- jobID:
		case <-s.ctx.Done():
			return
		}
	}
}
