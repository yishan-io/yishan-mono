package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"yishan/apps/cli/internal/scheduledjob"
)

const scheduledJobColumns = `id, organization_id, project_id, node_id, name, agent_kind, prompt, model, command,
	cron_expression, timezone, status, next_run_at, last_scheduled_for, last_run_at, last_run_status,
	last_error_code, last_error_message, created_by_user_id, created_at, updated_at`

// scheduleClaimWindow is how long after its due time an occurrence may still
// be claimed; later occurrences are skipped, never caught up.
const scheduleClaimWindow = time.Minute

// NextRunFunc computes a job's next occurrence after from.
type NextRunFunc func(job scheduledjob.Job, from time.Time) (time.Time, error)

// ScheduledJobStore persists scheduled jobs and their runs.
type ScheduledJobStore struct {
	database *sql.DB
}

// NewScheduledJobStore creates a scheduled job store backed by database.
func NewScheduledJobStore(database *sql.DB) *ScheduledJobStore {
	return &ScheduledJobStore{database: database}
}

// CreateJob inserts job.
func (store *ScheduledJobStore) CreateJob(ctx context.Context, job scheduledjob.Job) error {
	return insertScheduledJob(ctx, store.database, job, false)
}

// ImportJobs inserts jobs that are not stored yet, leaving existing rows.
func (store *ScheduledJobStore) ImportJobs(ctx context.Context, jobs []scheduledjob.Job, runs []scheduledjob.Run) error {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin scheduled job import: %w", err)
	}
	for _, job := range jobs {
		if err := insertScheduledJob(ctx, tx, job, true); err != nil {
			_ = tx.Rollback() // preserve the original error
			return err
		}
	}
	for _, run := range runs {
		if err := insertScheduledJobRun(ctx, tx, run, true); err != nil {
			_ = tx.Rollback() // preserve the original error
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit scheduled job import: %w", err)
	}
	return nil
}

// GetJob returns one job.
func (store *ScheduledJobStore) GetJob(ctx context.Context, jobID string) (scheduledjob.Job, error) {
	job, err := scanScheduledJob(store.database.QueryRowContext(ctx, `SELECT `+scheduledJobColumns+` FROM scheduled_jobs WHERE id = ?`, jobID))
	if errors.Is(err, sql.ErrNoRows) {
		return scheduledjob.Job{}, fmt.Errorf("get scheduled job %q: %w", jobID, scheduledjob.ErrJobNotFound)
	}
	if err != nil {
		return scheduledjob.Job{}, fmt.Errorf("get scheduled job %q: %w", jobID, err)
	}
	return job, nil
}

// ListJobs returns an organization's jobs, optionally for one project,
// newest first.
func (store *ScheduledJobStore) ListJobs(ctx context.Context, organizationID string, projectID string) ([]scheduledjob.Job, error) {
	query := `SELECT ` + scheduledJobColumns + ` FROM scheduled_jobs WHERE organization_id = ?`
	arguments := []any{organizationID}
	if projectID != "" {
		query += ` AND project_id = ?`
		arguments = append(arguments, projectID)
	}
	return store.listJobs(ctx, query+` ORDER BY created_at DESC, id`, arguments...)
}

// ListActiveJobs returns every active job on nodeID.
func (store *ScheduledJobStore) ListActiveJobs(ctx context.Context, nodeID string) ([]scheduledjob.Job, error) {
	return store.listJobs(ctx, `SELECT `+scheduledJobColumns+` FROM scheduled_jobs
		WHERE status = 'active' AND node_id = ? ORDER BY next_run_at, id`, nodeID)
}

// SaveJob writes every mutable field of job.
func (store *ScheduledJobStore) SaveJob(ctx context.Context, job scheduledjob.Job) error {
	result, err := store.database.ExecContext(ctx, `UPDATE scheduled_jobs SET name = ?, agent_kind = ?, prompt = ?,
		model = ?, command = ?, cron_expression = ?, timezone = ?, status = ?, next_run_at = ?, updated_at = ?
		WHERE id = ?`, job.Name, job.AgentKind, job.Prompt, job.Model, job.Command, job.CronExpression, job.Timezone,
		job.Status, job.NextRunAt, job.UpdatedAt, job.ID)
	if err != nil {
		return fmt.Errorf("save scheduled job: %w", err)
	}
	return requireJobAffected(result, job.ID)
}

// DeleteJob removes a job and, through the foreign key, its runs.
func (store *ScheduledJobStore) DeleteJob(ctx context.Context, jobID string) error {
	result, err := store.database.ExecContext(ctx, `DELETE FROM scheduled_jobs WHERE id = ?`, jobID)
	if err != nil {
		return fmt.Errorf("delete scheduled job: %w", err)
	}
	return requireJobAffected(result, jobID)
}

// ClaimOccurrence atomically claims the occurrence due at expected: the job
// must still be active with that next_run_at, and now must fall within the
// claim window. It advances next_run_at and records a pending schedule run.
func (store *ScheduledJobStore) ClaimOccurrence(ctx context.Context, jobID string, expected time.Time, now time.Time, runID string, nextRun NextRunFunc) (scheduledjob.Job, scheduledjob.Run, error) {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, fmt.Errorf("begin scheduled job claim: %w", err)
	}
	job, run, err := claimInTx(ctx, tx, jobID, expected, now, runID, nextRun)
	if err != nil {
		_ = tx.Rollback() // preserve the original error
		return scheduledjob.Job{}, scheduledjob.Run{}, err
	}
	if err := tx.Commit(); err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, fmt.Errorf("commit scheduled job claim: %w", err)
	}
	return job, run, nil
}

func claimInTx(ctx context.Context, tx *sql.Tx, jobID string, expected time.Time, now time.Time, runID string, nextRun NextRunFunc) (scheduledjob.Job, scheduledjob.Run, error) {
	job, err := scanScheduledJob(tx.QueryRowContext(ctx, `SELECT `+scheduledJobColumns+` FROM scheduled_jobs WHERE id = ?`, jobID))
	if err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, scheduledjob.ErrClaimRejected
	}
	scheduledFor := scheduledjob.FormatTime(expected)
	if job.Status != scheduledjob.StatusActive || job.NextRunAt != scheduledFor ||
		now.Before(expected) || now.Sub(expected) > scheduleClaimWindow {
		return scheduledjob.Job{}, scheduledjob.Run{}, scheduledjob.ErrClaimRejected
	}
	next, err := nextRun(job, now)
	if err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, fmt.Errorf("compute next scheduled run: %w", err)
	}
	job.NextRunAt, job.LastScheduledFor, job.UpdatedAt = scheduledjob.FormatTime(next), &scheduledFor, scheduledjob.FormatTime(now)
	if _, err := tx.ExecContext(ctx, `UPDATE scheduled_jobs SET next_run_at = ?, last_scheduled_for = ?, updated_at = ? WHERE id = ?`,
		job.NextRunAt, scheduledFor, job.UpdatedAt, job.ID); err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, fmt.Errorf("advance scheduled job: %w", err)
	}
	run := NewPendingRun(job, runID, scheduledFor, scheduledjob.TriggerSchedule, now)
	if err := insertScheduledJobRun(ctx, tx, run, false); err != nil {
		return scheduledjob.Job{}, scheduledjob.Run{}, scheduledjob.ErrClaimRejected
	}
	return job, run, nil
}

// FastForwardOverdue moves overdue active jobs on nodeID that are not in
// protected to their next future occurrence. Missed occurrences are skipped.
func (store *ScheduledJobStore) FastForwardOverdue(ctx context.Context, nodeID string, now time.Time, protected map[string]bool, nextRun NextRunFunc) error {
	jobs, err := store.ListActiveJobs(ctx, nodeID)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if protected[job.ID] || job.NextRunAt >= scheduledjob.FormatTime(now) {
			continue
		}
		next, err := nextRun(job, now)
		if err != nil {
			return fmt.Errorf("compute next run for scheduled job %q: %w", job.ID, err)
		}
		if _, err := store.database.ExecContext(ctx, `UPDATE scheduled_jobs SET next_run_at = ?, updated_at = ?
			WHERE id = ? AND next_run_at = ?`, scheduledjob.FormatTime(next), scheduledjob.FormatTime(now), job.ID, job.NextRunAt); err != nil {
			return fmt.Errorf("fast-forward scheduled job %q: %w", job.ID, err)
		}
	}
	return nil
}

func (store *ScheduledJobStore) listJobs(ctx context.Context, query string, arguments ...any) ([]scheduledjob.Job, error) {
	rows, err := store.database.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list scheduled jobs: %w", err)
	}
	defer rows.Close()
	jobs := make([]scheduledjob.Job, 0)
	for rows.Next() {
		job, err := scanScheduledJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan scheduled job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate scheduled jobs: %w", err)
	}
	return jobs, nil
}

type sqlExecer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func insertScheduledJob(ctx context.Context, exec sqlExecer, job scheduledjob.Job, ignoreExisting bool) error {
	verb := "INSERT"
	if ignoreExisting {
		verb = "INSERT OR IGNORE"
	}
	_, err := exec.ExecContext(ctx, verb+` INTO scheduled_jobs (`+scheduledJobColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		job.ID, job.OrganizationID, job.ProjectID, job.NodeID, job.Name, job.AgentKind, job.Prompt, job.Model,
		job.Command, job.CronExpression, job.Timezone, job.Status, job.NextRunAt, job.LastScheduledFor, job.LastRunAt,
		job.LastRunStatus, job.LastErrorCode, job.LastErrorMessage, job.CreatedByUserID, job.CreatedAt, job.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert scheduled job: %w", err)
	}
	return nil
}

func scanScheduledJob(scanner interface{ Scan(...any) error }) (scheduledjob.Job, error) {
	var job scheduledjob.Job
	err := scanner.Scan(&job.ID, &job.OrganizationID, &job.ProjectID, &job.NodeID, &job.Name, &job.AgentKind,
		&job.Prompt, &job.Model, &job.Command, &job.CronExpression, &job.Timezone, &job.Status, &job.NextRunAt,
		&job.LastScheduledFor, &job.LastRunAt, &job.LastRunStatus, &job.LastErrorCode, &job.LastErrorMessage,
		&job.CreatedByUserID, &job.CreatedAt, &job.UpdatedAt)
	return job, err
}

func requireJobAffected(result sql.Result, jobID string) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected scheduled job rows: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("scheduled job %q: %w", jobID, scheduledjob.ErrJobNotFound)
	}
	return nil
}
