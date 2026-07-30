package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	legacyJSONImportCompleteKey = "token_usage_json_import_complete"
	legacyJSONBackupPendingKey  = "token_usage_json_backup_pending"
)

// IsLegacyJSONImportComplete returns whether the JSON import marker is set.
func IsLegacyJSONImportComplete(ctx context.Context, database *sql.DB) (bool, error) {
	return metadataValueIs(ctx, database, legacyJSONImportCompleteKey, "true")
}

// IsLegacyJSONBackupPending returns whether the post-import rename still needs to run.
func IsLegacyJSONBackupPending(ctx context.Context, database *sql.DB) (bool, error) {
	return metadataValueIs(ctx, database, legacyJSONBackupPendingKey, "true")
}

// ClearLegacyJSONBackupPending removes the backup-pending marker after a successful rename.
func ClearLegacyJSONBackupPending(ctx context.Context, database *sql.DB) error {
	if _, err := database.ExecContext(ctx, `DELETE FROM _metadata WHERE key = ?`, legacyJSONBackupPendingKey); err != nil {
		return fmt.Errorf("clear token usage backup marker: %w", err)
	}
	return nil
}

// ImportLegacyHourlyUsage writes legacy rows into token_usage_hourly in one transaction,
// resolves workspace-level organization attribution, merges with any existing rows, and
// records import-complete and backup-pending markers.
func ImportLegacyHourlyUsage(ctx context.Context, database *sql.DB, rows []HourlyUsageRow, lastSuccessfulSyncAt int64) error {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin legacy token usage import: %w", err)
	}
	defer tx.Rollback()

	for _, row := range rows {
		if row.OrganizationID == "" {
			orgID, queryErr := findWorkspaceOrganizationID(ctx, tx, row.WorkspaceID)
			if queryErr != nil {
				return queryErr
			}
			row.OrganizationID = orgID
		}
		existingRow, hasExisting, queryErr := lookupHourlyUsageRow(ctx, tx, row)
		if queryErr != nil {
			return queryErr
		}
		mergedRow := MergeHourlyUsageRow(existingRow, hasExisting, row)
		if err := upsertHourlyUsageRow(ctx, tx, mergedRow); err != nil {
			return err
		}
	}
	if err := pruneCleanHourlyUsageRows(ctx, tx, time.Now().UTC()); err != nil {
		return err
	}
	if lastSuccessfulSyncAt != 0 {
		if err := upsertMetadata(ctx, tx, hourlyUsageLastSyncMetadataKey, fmt.Sprintf("%d", lastSuccessfulSyncAt)); err != nil {
			return err
		}
	}
	if err := upsertMetadata(ctx, tx, legacyJSONImportCompleteKey, "true"); err != nil {
		return err
	}
	if err := upsertMetadata(ctx, tx, legacyJSONBackupPendingKey, "true"); err != nil {
		return err
	}
	return tx.Commit()
}

func findWorkspaceOrganizationID(ctx context.Context, tx *sql.Tx, workspaceID string) (string, error) {
	var orgID string
	err := tx.QueryRowContext(ctx, `SELECT organization_id FROM workspaces WHERE id = ?`, workspaceID).Scan(&orgID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("resolve token usage organization: %w", err)
	}
	return orgID, nil
}

func lookupHourlyUsageRow(ctx context.Context, tx *sql.Tx, row HourlyUsageRow) (HourlyUsageRow, bool, error) {
	queryRows, err := tx.QueryContext(ctx, `SELECT project_id, workspace_id, workspace_path, organization_id,
		agent_kind, model, model_normalized, bucket_start_hour_utc, input_tokens, output_tokens,
		cached_input_tokens, cached_write_tokens, reasoning_tokens, total_tokens, event_count,
		session_count, turn_count, tool_call_count, attribution_confidence, scanner_source_kind,
		scanner_source_id, ingested_at, run_id, updated_at, is_dirty, last_synced_at FROM token_usage_hourly
		WHERE project_id = ? AND workspace_id = ? AND agent_kind = ? AND model_normalized = ? AND bucket_start_hour_utc = ?`,
		row.ProjectID, row.WorkspaceID, row.AgentKind, row.ModelNormalized, row.BucketStartHourUTC)
	if err != nil {
		return HourlyUsageRow{}, false, fmt.Errorf("query existing imported usage row: %w", err)
	}
	defer queryRows.Close()
	usageRows, err := scanHourlyUsageRows(queryRows)
	if err != nil {
		return HourlyUsageRow{}, false, err
	}
	if len(usageRows) == 0 {
		return HourlyUsageRow{}, false, nil
	}
	return usageRows[0], true, nil
}

func metadataValueIs(ctx context.Context, database *sql.DB, key string, expected string) (bool, error) {
	var value string
	err := database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read metadata %q: %w", key, err)
	}
	return value == expected, nil
}

func upsertMetadata(ctx context.Context, tx *sql.Tx, key, value string) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value); err != nil {
		return fmt.Errorf("write metadata %q: %w", key, err)
	}
	return nil
}
