package backgroundjob

import (
	"context"
)

// Cancel atomically cancels queued jobs or stops an admitted running job.
func (s *Service) Cancel(ctx context.Context, jobID string) error {
	job, err := s.repository.Get(ctx, jobID)
	if err != nil || !s.isLocalJob(job) {
		return err
	}
	if job.Status == StatusQueued {
		_, _, err = s.transition(ctx, job.ID, StatusQueued, StatusCancelled, Outcome{})
		return err
	}
	if job.Status != StatusRunning {
		return nil
	}
	if s.cancelLease(job.WorkspaceID, job.ID) {
		return nil
	}
	if cleanupErr := s.stop(job); cleanupErr != nil {
		s.completeFinal(job, StatusFailed, failureOutcome(cleanupErr))
		return cleanupErr
	}
	s.completeFinal(job, StatusCancelled, Outcome{})
	return nil
}

// CancelWorkspace blocks admission, cancels and waits for every admitted job before teardown.
func (s *Service) CancelWorkspace(ctx context.Context, workspaceID string) error {
	cleanupCtx, cancel := context.WithTimeout(ctx, s.cleanupTimeout)
	defer cancel()
	leases := s.closeWorkspaceAdmission(workspaceID)
	for _, lease := range leases {
		lease.cancel()
	}
	if err := s.cancelWorkspaceJobs(cleanupCtx, workspaceID); err != nil {
		s.abortWorkspaceClose(workspaceID)
		return err
	}
	if err := waitLeases(cleanupCtx, leases); err != nil {
		s.abortWorkspaceClose(workspaceID)
		return err
	}
	return nil
}

// AbortWorkspaceClose restores job admission after a workspace close aborts.
func (s *Service) AbortWorkspaceClose(workspaceID string) {
	s.abortWorkspaceClose(workspaceID)
}

func (s *Service) abortWorkspaceClose(workspaceID string) {
	s.mu.Lock()
	delete(s.closing, workspaceID)
	s.mu.Unlock()
}

func (s *Service) closeWorkspaceAdmission(workspaceID string) []*workspaceLease {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closing[workspaceID] = true
	entries := s.leases[workspaceID]
	leases := make([]*workspaceLease, 0, len(entries))
	for _, lease := range entries {
		leases = append(leases, lease)
	}
	return leases
}
func (s *Service) cancelWorkspaceJobs(ctx context.Context, workspaceID string) error {
	jobs, err := s.repository.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if !s.isLocalJob(job) || (job.Status != StatusQueued && job.Status != StatusRunning) {
			continue
		}
		if err := s.Cancel(ctx, job.ID); err != nil {
			return err
		}
	}
	return nil
}
func waitLeases(ctx context.Context, leases []*workspaceLease) error {
	for _, lease := range leases {
		select {
		case <-lease.done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}
func (s *Service) cancelLease(workspaceID, jobID string) bool {
	s.mu.Lock()
	lease := s.leases[workspaceID][jobID]
	s.mu.Unlock()
	if lease == nil || lease.cancel == nil {
		return false
	}
	lease.cancel()
	return true
}

// Close cancels all runners and waits for them under ctx before DSH or SQLite shutdown.
func (s *Service) Close(ctx context.Context) error {
	s.mu.Lock()
	if !s.isClosed {
		s.isClosed = true
		s.cancel()
	}
	s.mu.Unlock()
	done := make(chan struct{})
	go func() { s.waitGroup.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		return ctx.Err()
	}
	persistCtx, cancel := context.WithTimeout(ctx, s.cleanupTimeout)
	defer cancel()
	return s.persistPendingTerminals(persistCtx)
}
