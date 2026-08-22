package sqlite

import (
	"context"
	"database/sql"
	"fmt"
)

const localTaskLegacyImportPrefix = "legacy-task-context-v1:"

// LocalTaskLegacyImportCompleted reports whether a project's legacy task import completed.
func LocalTaskLegacyImportCompleted(ctx context.Context, database *sql.DB, projectID string) (bool, error) {
	importName := localTaskLegacyImportPrefix + projectID
	var name string
	err := database.QueryRowContext(ctx, `SELECT name FROM local_task_imports WHERE name = ?`, importName).Scan(&name)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check local task legacy import: %w", err)
	}
	return true, nil
}

// MarkLocalTaskLegacyImportCompleted records a verified project's legacy task import.
func MarkLocalTaskLegacyImportCompleted(ctx context.Context, database *sql.DB, projectID string) error {
	importName := localTaskLegacyImportPrefix + projectID
	_, err := database.ExecContext(ctx, `INSERT OR IGNORE INTO local_task_imports (name) VALUES (?)`, importName)
	if err != nil {
		return fmt.Errorf("mark local task legacy import completed: %w", err)
	}
	return nil
}
