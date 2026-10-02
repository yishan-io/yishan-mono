package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ScheduledJobRunOutboxDeliveredRetention limits local retention of delivered run reports.
const ScheduledJobRunOutboxDeliveredRetention = 7 * 24 * time.Hour

const scheduledJobRunOutboxColumns = `run_id, job_id, node_id, scheduled_for, state, result_status,
	response_body, error_code, error_message, updated_at, delivered_at`

// ScheduledJobRunOutboxState describes the durable lifecycle of a claimed run.
type ScheduledJobRunOutboxState string

const (
	ScheduledJobRunOutboxStateClaimed  ScheduledJobRunOutboxState = "claimed"
	ScheduledJobRunOutboxStateStarted  ScheduledJobRunOutboxState = "started"
	ScheduledJobRunOutboxStateFinished ScheduledJobRunOutboxState = "finished"
)

// ScheduledJobRunOutboxClaim identifies a claimed occurrence without its prompt or execution secrets.
type ScheduledJobRunOutboxClaim struct {
	RunID        string
	JobID        string
	NodeID       string
	ScheduledFor time.Time
}

// ScheduledJobRunOutboxResult is the terminal result retained until delivery succeeds.
type ScheduledJobRunOutboxResult struct {
	Status       string
	ResponseBody string
	ErrorCode    string
	ErrorMessage string
}

// ScheduledJobRunOutboxRow is one durable local run attempt.
type ScheduledJobRunOutboxRow struct {
	ScheduledJobRunOutboxClaim
	State       ScheduledJobRunOutboxState
	Result      ScheduledJobRunOutboxResult
	UpdatedAt   time.Time
	DeliveredAt *time.Time
}

// ScheduledJobRunOutboxStore persists scheduled-job run delivery state.
type ScheduledJobRunOutboxStore struct {
	database *sql.DB
}

// NewScheduledJobRunOutboxStore creates a scheduled-job outbox over database.
func NewScheduledJobRunOutboxStore(database *sql.DB) *ScheduledJobRunOutboxStore {
	return &ScheduledJobRunOutboxStore{database: database}
}

// SaveClaim durably records an occurrence before any execution begins.
func (s *ScheduledJobRunOutboxStore) SaveClaim(ctx context.Context, claim ScheduledJobRunOutboxClaim) (bool, error) {
	result, err := s.database.ExecContext(ctx, `INSERT INTO scheduled_job_run_outbox (`+scheduledJobRunOutboxColumns+`)
		VALUES (?, ?, ?, ?, 'claimed', '', '', '', '', ?, NULL) ON CONFLICT(run_id) DO NOTHING`,
		claim.RunID, claim.JobID, claim.NodeID, claim.ScheduledFor.UTC().UnixMilli(), time.Now().UTC().UnixMilli())
	return outboxRowsAffected(result, err, "save scheduled-job run claim")
}

// MarkStarted moves a claimed run to started with a compare-and-swap update.
func (s *ScheduledJobRunOutboxStore) MarkStarted(ctx context.Context, runID string, startedAt time.Time) (bool, error) {
	result, err := s.database.ExecContext(ctx, `UPDATE scheduled_job_run_outbox SET state = 'started', updated_at = ?
		WHERE run_id = ? AND state = 'claimed'`, startedAt.UTC().UnixMilli(), runID)
	return outboxRowsAffected(result, err, "mark scheduled-job run started")
}

// SaveResult writes a terminal result once, preserving it for idempotent delivery retries.
func (s *ScheduledJobRunOutboxStore) SaveResult(ctx context.Context, runID string, result ScheduledJobRunOutboxResult, finishedAt time.Time) (bool, error) {
	updateResult, err := s.database.ExecContext(ctx, `UPDATE scheduled_job_run_outbox SET state = 'finished', result_status = ?,
		response_body = ?, error_code = ?, error_message = ?, updated_at = ?
		WHERE run_id = ? AND state IN ('claimed', 'started')`, result.Status, result.ResponseBody, result.ErrorCode,
		result.ErrorMessage, finishedAt.UTC().UnixMilli(), runID)
	return outboxRowsAffected(updateResult, err, "save scheduled-job run result")
}

// ListUndelivered returns run attempts requiring recovery or terminal result delivery.
func (s *ScheduledJobRunOutboxStore) ListUndelivered(ctx context.Context) ([]ScheduledJobRunOutboxRow, error) {
	rows, err := s.database.QueryContext(ctx, `SELECT `+scheduledJobRunOutboxColumns+` FROM scheduled_job_run_outbox
		WHERE delivered_at IS NULL ORDER BY updated_at, run_id`)
	if err != nil {
		return nil, fmt.Errorf("list undelivered scheduled-job runs: %w", err)
	}
	defer rows.Close()
	return scanScheduledJobRunOutboxRows(rows)
}

// MarkDelivered acknowledges a finished result and prunes expired delivered rows atomically.
func (s *ScheduledJobRunOutboxStore) MarkDelivered(ctx context.Context, runID string, deliveredAt time.Time) (bool, error) {
	transaction, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin scheduled-job delivery acknowledgement: %w", err)
	}
	defer transaction.Rollback()
	result, err := transaction.ExecContext(ctx, `UPDATE scheduled_job_run_outbox SET delivered_at = ?, updated_at = ?
		WHERE run_id = ? AND state = 'finished' AND delivered_at IS NULL`, deliveredAt.UTC().UnixMilli(), deliveredAt.UTC().UnixMilli(), runID)
	applied, err := outboxRowsAffected(result, err, "mark scheduled-job run delivered")
	if err != nil {
		return false, err
	}
	if err := pruneDeliveredScheduledJobRuns(ctx, transaction, deliveredAt); err != nil {
		return false, err
	}
	if err := transaction.Commit(); err != nil {
		return false, fmt.Errorf("commit scheduled-job delivery acknowledgement: %w", err)
	}
	return applied, nil
}

func outboxRowsAffected(result sql.Result, err error, operation string) (bool, error) {
	if err != nil {
		return false, fmt.Errorf("%s: %w", operation, err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read %s result: %w", operation, err)
	}
	return count == 1, nil
}

func scanScheduledJobRunOutboxRows(rows *sql.Rows) ([]ScheduledJobRunOutboxRow, error) {
	outboxRows := make([]ScheduledJobRunOutboxRow, 0)
	for rows.Next() {
		outboxRow, err := scanScheduledJobRunOutboxRow(rows)
		if err != nil {
			return nil, err
		}
		outboxRows = append(outboxRows, outboxRow)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate scheduled-job outbox rows: %w", err)
	}
	return outboxRows, nil
}

func scanScheduledJobRunOutboxRow(scanner interface{ Scan(...any) error }) (ScheduledJobRunOutboxRow, error) {
	var row ScheduledJobRunOutboxRow
	var scheduledFor, updatedAt int64
	var deliveredAt sql.NullInt64
	err := scanner.Scan(&row.RunID, &row.JobID, &row.NodeID, &scheduledFor, &row.State, &row.Result.Status,
		&row.Result.ResponseBody, &row.Result.ErrorCode, &row.Result.ErrorMessage, &updatedAt, &deliveredAt)
	if err != nil {
		return ScheduledJobRunOutboxRow{}, fmt.Errorf("scan scheduled-job outbox row: %w", err)
	}
	row.ScheduledFor = time.UnixMilli(scheduledFor).UTC()
	row.UpdatedAt = time.UnixMilli(updatedAt).UTC()
	if deliveredAt.Valid {
		value := time.UnixMilli(deliveredAt.Int64).UTC()
		row.DeliveredAt = &value
	}
	return row, nil
}

func pruneDeliveredScheduledJobRuns(ctx context.Context, transaction *sql.Tx, now time.Time) error {
	cutoff := now.UTC().Add(-ScheduledJobRunOutboxDeliveredRetention).UnixMilli()
	if _, err := transaction.ExecContext(ctx, `DELETE FROM scheduled_job_run_outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?`, cutoff); err != nil {
		return fmt.Errorf("prune delivered scheduled-job runs: %w", err)
	}
	return nil
}
