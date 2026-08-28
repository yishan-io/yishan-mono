package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"yishan/apps/cli/internal/backgroundjob"
)

const backgroundJobColumns = `id, kind, runtime, workspace_id, project_id, organization_id, owner_node_id,
	session_id, cwd, prompt, model, status, result_text, error_code, error_message, created_at, updated_at, started_at, finished_at`

var _ backgroundjob.Repository = (*BackgroundJobStore)(nil)

// BackgroundJobStore persists daemon-owned background jobs in SQLite.
type BackgroundJobStore struct {
	database *sql.DB
}

// NewBackgroundJobStore creates a background job store backed by database.
func NewBackgroundJobStore(database *sql.DB) *BackgroundJobStore {
	return &BackgroundJobStore{database: database}
}

// Create persists a queued background job and assigns an ID when omitted.
func (store *BackgroundJobStore) Create(ctx context.Context, job backgroundjob.Job) (backgroundjob.Job, error) {
	if job.ID == "" {
		job.ID = uuid.NewString()
	}
	if err := backgroundjob.ValidateJob(job); err != nil {
		return backgroundjob.Job{}, err
	}
	created, err := scanBackgroundJob(store.database.QueryRowContext(ctx, `INSERT INTO background_jobs (`+backgroundJobColumns+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), NULL, NULL)
		RETURNING `+backgroundJobColumns,
		job.ID, job.Kind, job.Runtime, job.WorkspaceID, job.ProjectID, job.OrganizationID, job.OwnerNodeID,
		job.SessionID, job.CWD, job.Prompt, job.Model, job.Status, job.ResultText, job.ErrorCode, job.ErrorMessage))
	if err != nil {
		return backgroundjob.Job{}, fmt.Errorf("create background job: %w", err)
	}
	return created, nil
}

// Get loads a background job by ID.
func (store *BackgroundJobStore) Get(ctx context.Context, jobID string) (backgroundjob.Job, error) {
	job, err := scanBackgroundJob(store.database.QueryRowContext(ctx,
		`SELECT `+backgroundJobColumns+` FROM background_jobs WHERE id = ?`, jobID))
	return handleBackgroundJobGet(jobID, job, err)
}

// ListByWorkspace loads jobs newest first for one workspace.
func (store *BackgroundJobStore) ListByWorkspace(ctx context.Context, workspaceID string) ([]backgroundjob.Job, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT `+backgroundJobColumns+` FROM background_jobs
		WHERE workspace_id = ? ORDER BY created_at DESC, id DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list background jobs for workspace: %w", err)
	}
	defer rows.Close()
	return scanBackgroundJobs(rows)
}

// CompareAndSwapStatus atomically changes status when the job still has expected.
func (store *BackgroundJobStore) CompareAndSwapStatus(ctx context.Context, id string, expected, next backgroundjob.Status, outcome backgroundjob.Outcome) (backgroundjob.Job, bool, error) {
	if _, err := expected.Transition(next); err != nil || expected == next || invalidOutcomeForStatus(next, outcome) {
		return backgroundjob.Job{}, false, backgroundjob.ErrInvalidTransition
	}
	row := store.database.QueryRowContext(ctx, backgroundJobCASQuery(next), next, outcome.ResultText, outcome.ErrorCode,
		outcome.ErrorMessage, id, expected)
	job, err := scanBackgroundJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return backgroundjob.Job{}, false, nil
	}
	if err != nil {
		return backgroundjob.Job{}, false, fmt.Errorf("compare and swap background job status: %w", err)
	}
	return job, true, nil
}

// ListForStartupRecovery loads jobs left queued or running by a prior daemon.
func (store *BackgroundJobStore) ListForStartupRecovery(ctx context.Context) ([]backgroundjob.Job, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT `+backgroundJobColumns+` FROM background_jobs
		WHERE status IN ('queued', 'running') ORDER BY created_at, id`)
	if err != nil {
		return nil, fmt.Errorf("list background jobs for startup recovery: %w", err)
	}
	defer rows.Close()
	return scanBackgroundJobs(rows)
}

func invalidOutcomeForStatus(status backgroundjob.Status, outcome backgroundjob.Outcome) bool {
	if err := backgroundjob.ValidateOutcome(outcome); err != nil {
		return true
	}
	return !isBackgroundJobTerminal(status) && outcome != (backgroundjob.Outcome{})
}

func isBackgroundJobTerminal(status backgroundjob.Status) bool {
	return status == backgroundjob.StatusSucceeded || status == backgroundjob.StatusFailed ||
		status == backgroundjob.StatusCancelled || status == backgroundjob.StatusInterrupted
}

func backgroundJobCASQuery(next backgroundjob.Status) string {
	startedAt := "started_at"
	finishedAt := "finished_at"
	if next == backgroundjob.StatusRunning {
		startedAt, finishedAt = "COALESCE(started_at, datetime('now'))", "NULL"
	}
	if isBackgroundJobTerminal(next) {
		finishedAt = "datetime('now')"
	}
	return `UPDATE background_jobs SET status = ?, result_text = ?, error_code = ?, error_message = ?,
		updated_at = datetime('now'), started_at = ` + startedAt + `, finished_at = ` + finishedAt + `
		WHERE id = ? AND status = ? RETURNING ` + backgroundJobColumns
}

func scanBackgroundJobs(rows *sql.Rows) ([]backgroundjob.Job, error) {
	jobs := make([]backgroundjob.Job, 0)
	for rows.Next() {
		job, err := scanBackgroundJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan background job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate background jobs: %w", err)
	}
	return jobs, nil
}

func scanBackgroundJob(scanner interface{ Scan(...any) error }) (backgroundjob.Job, error) {
	var job backgroundjob.Job
	var startedAt, finishedAt sql.NullString
	err := scanner.Scan(&job.ID, &job.Kind, &job.Runtime, &job.WorkspaceID, &job.ProjectID, &job.OrganizationID,
		&job.OwnerNodeID, &job.SessionID, &job.CWD, &job.Prompt, &job.Model, &job.Status, &job.ResultText,
		&job.ErrorCode, &job.ErrorMessage, &job.CreatedAt, &job.UpdatedAt, &startedAt, &finishedAt)
	if err != nil {
		return backgroundjob.Job{}, err
	}
	if startedAt.Valid {
		job.StartedAt = stringPointer(startedAt.String)
	}
	if finishedAt.Valid {
		job.FinishedAt = stringPointer(finishedAt.String)
	}
	return job, nil
}

func handleBackgroundJobGet(id string, job backgroundjob.Job, err error) (backgroundjob.Job, error) {
	if errors.Is(err, sql.ErrNoRows) {
		return backgroundjob.Job{}, fmt.Errorf("get background job %q: %w", id, backgroundjob.ErrJobNotFound)
	}
	if err != nil {
		return backgroundjob.Job{}, fmt.Errorf("get background job %q: %w", id, err)
	}
	return job, nil
}
