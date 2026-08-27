package backgroundjob

import (
	"context"
	"errors"

	"yishan/apps/cli/internal/agent/dsh"

	"github.com/rs/zerolog/log"
)

func (s *Service) execute(ctx context.Context, job Job) {
	result, err := s.runPrompt(ctx, job)
	if err == nil {
		err = s.dispose(ctx, job)
	}
	if err == nil {
		s.complete(ctx, job, StatusSucceeded, Outcome{ResultText: result})
		return
	}
	s.finish(job, err)
}

func (s *Service) runPrompt(ctx context.Context, job Job) (string, error) {
	if _, err := s.execution.StartSession(ctx, startRequest(job)); err != nil {
		return "", err
	}
	subscription, err := s.execution.SubscribeSession(ctx, subscribeRequest(job))
	if err != nil {
		return "", err
	}
	defer subscription.Unsubscribe()
	if _, err := s.execution.PromptSession(ctx, promptRequest(job)); err != nil {
		return "", err
	}
	if err := waitForTerminalStatus(ctx, subscription.Updates); err != nil {
		return "", err
	}
	if _, err := s.execution.FlushSession(ctx, executionRequest(job)); err != nil {
		return "", err
	}
	transcript, err := s.execution.ReadSession(ctx, readRequest(job))
	if err != nil {
		return "", err
	}
	return collectTranscript(transcript.Events), nil
}

func waitForTerminalStatus(ctx context.Context, updates <-chan dsh.SessionUpdate) error {
	sawRunning := false
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case update, ok := <-updates:
			if !ok {
				return errors.New("DSH session subscription ended before completion")
			}
			if update.Unavailable || update.Reset != nil {
				return dsh.ErrRuntimeUnavailable
			}
			if update.Status == nil {
				continue
			}
			if update.Status.Status == "running" {
				sawRunning = true
			}
			if sawRunning && update.Status.Status == "idle" {
				return nil
			}
		}
	}
}

func (s *Service) finish(job Job, runErr error) {
	if errors.Is(runErr, context.Canceled) {
		cleanupErr := s.stop(job)
		if cleanupErr != nil {
			s.completeFinal(job, StatusFailed, failureOutcome(cleanupErr))
			return
		}
		s.completeFinal(job, StatusCancelled, Outcome{})
		return
	}
	status, outcome := failureStatus(runErr)
	if cleanupErr := s.disposeAfterFailure(job); cleanupErr != nil {
		if status == StatusInterrupted {
			log.Warn().Err(cleanupErr).Str("jobId", job.ID).Msg("dispose failed after DSH runtime loss")
		} else {
			outcome = failureOutcome(errors.Join(runErr, cleanupErr))
		}
	}
	s.completeFinal(job, status, outcome)
}

func (s *Service) disposeAfterFailure(job Job) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.cleanupTimeout)
	defer cancel()
	return s.dispose(ctx, job)
}

func failureStatus(runErr error) (Status, Outcome) {
	if errors.Is(runErr, dsh.ErrRuntimeUnavailable) || errors.Is(runErr, dsh.ErrRequestInterrupted) {
		return StatusInterrupted, Outcome{ErrorCode: failureCodeRuntime, ErrorMessage: truncateError(runErr)}
	}
	return StatusFailed, failureOutcome(runErr)
}
func (s *Service) stop(job Job) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.cleanupTimeout)
	defer cancel()
	_, cancelErr := s.execution.CancelSession(ctx, executionRequest(job))
	_, flushErr := s.execution.FlushSession(ctx, executionRequest(job))
	disposeErr := s.dispose(ctx, job)
	return errors.Join(cancelErr, flushErr, disposeErr)
}
func (s *Service) dispose(ctx context.Context, job Job) error {
	_, err := s.execution.DisposeSession(ctx, readRequest(job))
	return err
}
