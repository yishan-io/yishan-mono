package system

import "time"

func (s *LocalScheduler) dueWorker() {
	defer s.workers.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case job := <-s.dueJobs:
			if s.ctx.Err() != nil {
				return
			}
			s.claimAndExecute(job)
		}
	}
}

func (s *LocalScheduler) claimAndExecute(job LocalScheduledJob) {
	claim, err := s.claimOccurrence(job)
	if err != nil {
		s.clearClaim(job)
		_ = s.Refresh() // A failed claim must return to the authoritative schedule without replaying it.
		return
	}
	if !s.rearmClaimed(job, claim.NextRunAt) {
		return
	}
	s.execute(s.ctx, claim)
	s.clearRunning(job.ID)
}

func (s *LocalScheduler) claimOccurrence(job LocalScheduledJob) (LocalSchedulerClaimResult, error) {
	s.api.Lock()
	defer s.api.Unlock()
	return s.claim(s.ctx, job.ID, job.NextRunAt)
}

func (s *LocalScheduler) clearClaim(job LocalScheduledJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	claiming, exists := s.claiming[job.ID]
	if exists && claiming.NextRunAt.Equal(job.NextRunAt) {
		delete(s.claiming, job.ID)
	}
}

func (s *LocalScheduler) rearmClaimed(job LocalScheduledJob, nextRunAt time.Time) bool {
	s.mu.Lock()
	if claiming, exists := s.claiming[job.ID]; !exists || !claiming.NextRunAt.Equal(job.NextRunAt) || s.closed {
		s.mu.Unlock()
		return false
	}
	delete(s.claiming, job.ID)
	s.running[job.ID] = true
	s.armDueLocked(job.ID, nextRunAt)
	s.mu.Unlock()
	s.signalScheduleChanged()
	return true
}

func (s *LocalScheduler) clearRunning(jobID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.running, jobID)
}
