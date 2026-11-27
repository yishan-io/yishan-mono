package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"yishan/apps/cli/internal/scheduledjob"
)

const scheduledJobRunColumns = `id, job_id, organization_id, project_id, node_id, scheduled_for, trigger,
	started_at, finished_at, status, response_body, error_code, error_message, error_details, created_at`

// keptRunsPerJob bounds run history; older runs are pruned after each run.
const keptRunsPerJob = 200

// interruptedErrorCode marks runs a daemon stop left unfinished.
const interruptedErrorCode = "DAEMON_INTERRUPTED"

// NewPendingRun builds a pending run of job.
func NewPendingRun(job scheduledjob.Job, runID string, scheduledFor string, trigger string, now time.Time) scheduledjob.Run {
	return scheduledjob.Run{
		ID: runID, JobID: job.ID, OrganizationID: job.OrganizationID, ProjectID: job.ProjectID, NodeID: job.NodeID,
		ScheduledFor: scheduledFor, Trigger: trigger, Status: scheduledjob.RunPending, CreatedAt: scheduledjob.FormatTime(now),
	}
}

// CreateRun inserts a run (used for manual runs).
func (store *ScheduledJobStore) CreateRun(ctx context.Context, run scheduledjob.Run) error {
	return insertScheduledJobRun(ctx, store.database, run, false)
}

// ListRuns returns a job's most recent runs, newest first.
func (store *ScheduledJobStore) ListRuns(ctx context.Context, jobID string, limit int) ([]scheduledjob.Run, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT `+scheduledJobRunColumns+` FROM scheduled_job_runs
		WHERE job_id = ? ORDER BY scheduled_for DESC, created_at DESC LIMIT ?`, jobID, limit)
	if err != nil {
		return nil, fmt.Errorf("list scheduled job runs: %w", err)
	}
	defer rows.Close()
	runs := make([]scheduledjob.Run, 0)
	for rows.Next() {
		var run scheduledjob.Run
		if err := rows.Scan(&run.ID, &run.JobID, &run.OrganizationID, &run.ProjectID, &run.NodeID, &run.ScheduledFor,
			&run.Trigger, &run.StartedAt, &run.FinishedAt, &run.Status, &run.ResponseBody, &run.ErrorCode,
			&run.ErrorMessage, &run.ErrorDetails, &run.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan scheduled job run: %w", err)
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate scheduled job runs: %w", err)
	}
	return runs, nil
}

// MarkRunStarted moves a pending run to running. It reports false when the
// run is no longer pending.
func (store *ScheduledJobStore) MarkRunStarted(ctx context.Context, runID string, at time.Time) (bool, error) {
	result, err := store.database.ExecContext(ctx, `UPDATE scheduled_job_runs SET status = 'running', started_at = ?
		WHERE id = ? AND status = 'pending'`, scheduledjob.FormatTime(at), runID)
	if err != nil {
		return false, fmt.Errorf("mark scheduled job run started: %w", err)
	}
	affected, err := result.RowsAffected()
	return affected > 0, err
}

// CompleteRun records a run's terminal result, updates the job's last-run
// summary and prunes old history, in one transaction.
func (store *ScheduledJobStore) CompleteRun(ctx context.Context, runID string, result scheduledjob.Result, at time.Time) error {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin scheduled job run completion: %w", err)
	}
	if err := completeRunInTx(ctx, tx, runID, result, scheduledjob.FormatTime(at)); err != nil {
		_ = tx.Rollback() // preserve the original error
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit scheduled job run completion: %w", err)
	}
	return nil
}

func completeRunInTx(ctx context.Context, tx *sql.Tx, runID string, result scheduledjob.Result, finishedAt string) error {
	var jobID string
	if err := tx.QueryRowContext(ctx, `SELECT job_id FROM scheduled_job_runs WHERE id = ?`, runID).Scan(&jobID); err != nil {
		return fmt.Errorf("find scheduled job run %q: %w", runID, err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE scheduled_job_runs SET status = ?, finished_at = ?, response_body = ?,
		error_code = ?, error_message = ? WHERE id = ? AND status IN ('pending', 'running')`,
		result.Status, finishedAt, nullableText(result.ResponseBody), nullableText(result.ErrorCode),
		nullableText(result.ErrorMessage), runID); err != nil {
		return fmt.Errorf("complete scheduled job run: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE scheduled_jobs SET last_run_at = ?, last_run_status = ?,
		last_error_code = ?, last_error_message = ? WHERE id = ?`, finishedAt, lastRunStatus(result.Status),
		nullableText(result.ErrorCode), nullableText(result.ErrorMessage), jobID); err != nil {
		return fmt.Errorf("record scheduled job last run: %w", err)
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM scheduled_job_runs WHERE job_id = ? AND id NOT IN (
		SELECT id FROM scheduled_job_runs WHERE job_id = ? ORDER BY scheduled_for DESC, created_at DESC LIMIT ?)`,
		jobID, jobID, keptRunsPerJob)
	if err != nil {
		return fmt.Errorf("prune scheduled job runs: %w", err)
	}
	return nil
}

// InterruptUnfinishedRuns fails every pending or running run on nodeID; it is
// called at startup, when no run of this daemon can still be in flight.
func (store *ScheduledJobStore) InterruptUnfinishedRuns(ctx context.Context, nodeID string, at time.Time) error {
	_, err := store.database.ExecContext(ctx, `UPDATE scheduled_job_runs SET status = 'failed', finished_at = ?,
		error_code = ?, error_message = 'the daemon stopped before the run finished'
		WHERE node_id = ? AND status IN ('pending', 'running')`, scheduledjob.FormatTime(at), interruptedErrorCode, nodeID)
	if err != nil {
		return fmt.Errorf("interrupt unfinished scheduled job runs: %w", err)
	}
	return nil
}

func insertScheduledJobRun(ctx context.Context, exec sqlExecer, run scheduledjob.Run, ignoreExisting bool) error {
	verb := "INSERT"
	if ignoreExisting {
		verb = "INSERT OR IGNORE"
	}
	_, err := exec.ExecContext(ctx, verb+` INTO scheduled_job_runs (`+scheduledJobRunColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.ID, run.JobID, run.OrganizationID, run.ProjectID, run.NodeID, run.ScheduledFor, run.Trigger, run.StartedAt,
		run.FinishedAt, run.Status, run.ResponseBody, run.ErrorCode, run.ErrorMessage, run.ErrorDetails, run.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert scheduled job run: %w", err)
	}
	return nil
}

// lastRunStatus maps a run status to the job's last_run_status, which only
// records succeeded or failed.
func lastRunStatus(status string) string {
	if status == scheduledjob.RunSucceeded {
		return scheduledjob.RunSucceeded
	}
	return scheduledjob.RunFailed
}

func nullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}
