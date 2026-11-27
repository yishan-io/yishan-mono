package scheduledjob

import (
	"context"
	"fmt"
	"time"

	domain "yishan/apps/cli/internal/scheduledjob"

	"github.com/google/uuid"
)

// ScheduledOccurrence is the next due time of one active job.
type ScheduledOccurrence struct {
	JobID     string
	NextRunAt time.Time
}

// Snapshot fast-forwards overdue jobs (missed runs are skipped, never caught
// up) and returns every active job's next occurrence. Occurrences in
// protected are being armed or claimed by the scheduler and are left alone.
func (s *Service) Snapshot(ctx context.Context, protected []ScheduledOccurrence) ([]ScheduledOccurrence, error) {
	protectedIDs := make(map[string]bool, len(protected))
	for _, occurrence := range protected {
		protectedIDs[occurrence.JobID] = true
	}
	if err := s.store().FastForwardOverdue(ctx, s.deps.NodeID, s.now(), protectedIDs, nextRunOf); err != nil {
		return nil, err
	}
	jobs, err := s.store().ListActiveJobs(ctx, s.deps.NodeID)
	if err != nil {
		return nil, err
	}
	occurrences := make([]ScheduledOccurrence, 0, len(jobs))
	for _, job := range jobs {
		nextRunAt, err := domain.ParseTime(job.NextRunAt)
		if err != nil {
			return nil, fmt.Errorf("parse next run of scheduled job %q: %w", job.ID, err)
		}
		occurrences = append(occurrences, ScheduledOccurrence{JobID: job.ID, NextRunAt: nextRunAt})
	}
	return occurrences, nil
}

// ClaimOccurrence claims the occurrence of jobID due at expected and returns
// the run to execute. It fails with ErrClaimRejected when the occurrence is
// no longer due, was already claimed, or the job changed.
func (s *Service) ClaimOccurrence(ctx context.Context, jobID string, expected time.Time) (Claim, error) {
	runID := uuid.Must(uuid.NewV7()).String()
	job, _, err := s.store().ClaimOccurrence(ctx, jobID, expected, s.now(), runID, nextRunOf)
	if err != nil {
		return Claim{}, err
	}
	return s.claimFor(ctx, job, runID, expected), nil
}

func nextRunOf(job domain.Job, from time.Time) (time.Time, error) {
	return domain.NextRunAt(job.CronExpression, job.Timezone, from)
}
