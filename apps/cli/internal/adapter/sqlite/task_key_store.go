package sqlite

import (
	"context"
	"database/sql"
	"fmt"
)

// PersonalTaskKeyScope is the counter scope of personal (PERS-n) task keys.
const PersonalTaskKeyScope = "personal"

// ProjectTaskKeyScope is the counter scope of one project's task keys.
func ProjectTaskKeyScope(projectID string) string {
	return "project:" + projectID
}

// TaskKeyStore allocates Local Task display keys from local counters.
type TaskKeyStore struct {
	database *sql.DB
}

// NewTaskKeyStore creates a task key store backed by database.
func NewTaskKeyStore(database *sql.DB) *TaskKeyStore {
	return &TaskKeyStore{database: database}
}

// Allocate returns the next "<prefix>-<n>" key for scope. The counter never
// moves below the highest key already stored with that prefix, so keys that
// api-service reserved before the counters moved local are never reissued.
func (store *TaskKeyStore) Allocate(ctx context.Context, scope string, prefix string) (string, error) {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin task key allocation: %w", err)
	}
	next, err := nextTaskKeyNumber(ctx, tx, scope, prefix)
	if err != nil {
		_ = tx.Rollback() // preserve the original error
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO task_key_counters (scope, last_number) VALUES (?, ?)
		ON CONFLICT(scope) DO UPDATE SET last_number = excluded.last_number`, scope, next); err != nil {
		_ = tx.Rollback() // preserve the original error
		return "", fmt.Errorf("advance task key counter: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit task key allocation: %w", err)
	}
	return fmt.Sprintf("%s-%d", prefix, next), nil
}

func nextTaskKeyNumber(ctx context.Context, tx *sql.Tx, scope string, prefix string) (int64, error) {
	var counter sql.NullInt64
	err := tx.QueryRowContext(ctx, `SELECT last_number FROM task_key_counters WHERE scope = ?`, scope).Scan(&counter)
	if err != nil && err != sql.ErrNoRows {
		return 0, fmt.Errorf("read task key counter: %w", err)
	}
	var highest sql.NullInt64
	err = tx.QueryRowContext(ctx, `SELECT MAX(CAST(substr(task_key, length(?) + 2) AS INTEGER)) FROM local_tasks
		WHERE substr(task_key, 1, length(?) + 1) = ? || '-'`, prefix, prefix, prefix).Scan(&highest)
	if err != nil {
		return 0, fmt.Errorf("read highest task key: %w", err)
	}
	return max(counter.Int64, highest.Int64) + 1, nil
}
