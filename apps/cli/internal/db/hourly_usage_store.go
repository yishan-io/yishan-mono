package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/rs/zerolog/log"

	"sort"
	"strconv"
	"time"
)

const hourlyUsageLastSyncMetadataKey = "token_usage_last_successful_sync_at"

// HourlyUsageStore persists hourly usage in the daemon's local SQLite database.
type HourlyUsageStore struct {
	database *sql.DB
}

// NewHourlyUsageStore creates the SQLite-backed hourly usage store.
func NewHourlyUsageStore(database *sql.DB) *HourlyUsageStore {
	return &HourlyUsageStore{database: database}
}

// UpsertHourlyUsageRows writes rows directly without merge logic, preserving the
// caller's Dirty flag. Use for imports where merge semantics are handled upstream.
func (s *HourlyUsageStore) UpsertHourlyUsageRows(ctx context.Context, rows []HourlyUsageRow) error {
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin usage row upsert: %w", err)
	}
	defer tx.Rollback()
	for _, row := range rows {
		if err := upsertHourlyUsageRow(ctx, tx, row); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ReplaceAgentHourlyRows merges scanned rows and retains dirty rows until they are acknowledged.
func (s *HourlyUsageStore) ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []HourlyUsageRow) error {
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin usage row replacement: %w", err)
	}
	defer tx.Rollback()

	existingRows, err := listAgentHourlyRows(ctx, tx, agentKind)
	if err != nil {
		return err
	}
	existingByKey := make(map[string]HourlyUsageRow, len(existingRows))
	for _, existingRow := range existingRows {
		existingByKey[HourlyUsageRowKey(existingRow)] = existingRow
	}
	for _, scannedRow := range rows {
		key := HourlyUsageRowKey(scannedRow)
		existingRow, hasExisting := existingByKey[key]
		mergedRow := MergeHourlyUsageRow(existingRow, hasExisting, scannedRow)
		if err := upsertHourlyUsageRow(ctx, tx, mergedRow); err != nil {
			return err
		}
		existingByKey[key] = mergedRow
	}
	if err := pruneCleanHourlyUsageRows(ctx, tx, time.Now().UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

// ListDirtyHourlyRows returns dirty rows in stable upload order.
func (s *HourlyUsageStore) ListDirtyHourlyRows(ctx context.Context) ([]HourlyUsageRow, error) {
	rows, err := s.database.QueryContext(ctx, `SELECT project_id, workspace_id, workspace_path, organization_id,
		agent_kind, model, model_normalized, bucket_start_hour_utc, input_tokens, output_tokens,
		cached_input_tokens, cached_write_tokens, reasoning_tokens, total_tokens, event_count,
		session_count, turn_count, tool_call_count, attribution_confidence, scanner_source_kind,
		scanner_source_id, ingested_at, run_id, updated_at, is_dirty, last_synced_at
		FROM token_usage_hourly WHERE is_dirty = 1 ORDER BY bucket_start_hour_utc, project_id, workspace_id, agent_kind, model_normalized`)
	if err != nil {
		return nil, fmt.Errorf("query dirty usage rows: %w", err)
	}
	defer rows.Close()
	return scanHourlyUsageRows(rows)
}

// MarkHourlyRowsSynced marks only the exact rows included in an acknowledged upload clean.
func (s *HourlyUsageStore) MarkHourlyRowsSynced(ctx context.Context, rows []HourlyUsageRow, syncedAt int64) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin usage sync acknowledgement: %w", err)
	}
	defer tx.Rollback()

	for _, row := range rows {
		result, updateErr := tx.ExecContext(ctx, `UPDATE token_usage_hourly SET is_dirty = 0, last_synced_at = ?
			WHERE project_id = ? AND workspace_id = ? AND agent_kind = ? AND model_normalized = ?
			AND bucket_start_hour_utc = ? AND updated_at = ? AND input_tokens = ? AND output_tokens = ?
			AND cached_input_tokens = ? AND cached_write_tokens = ? AND reasoning_tokens = ? AND total_tokens = ?
			AND event_count = ? AND session_count = ? AND turn_count = ? AND tool_call_count = ?
			AND attribution_confidence = ?`, syncedAt, row.ProjectID, row.WorkspaceID, row.AgentKind,
			row.ModelNormalized, row.BucketStartHourUTC, row.UpdatedAt, row.InputTokens, row.OutputTokens,
			row.CachedInputTokens, row.CachedWriteTokens, row.ReasoningTokens, row.TotalTokens, row.EventCount,
			row.SessionCount, row.TurnCount, row.ToolCallCount, row.AttributionConfidence)
		if updateErr != nil {
			return fmt.Errorf("mark usage row synced: %w", updateErr)
		}
		affected, rowsErr := result.RowsAffected()
		if rowsErr != nil {
			return fmt.Errorf("read usage sync acknowledgement result: %w", rowsErr)
		}
		if affected == 0 {
			log.Warn().Str("workspaceId", row.WorkspaceID).Msg("markHourlyRowsSynced matched 0 rows (concurrent update?)")
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, hourlyUsageLastSyncMetadataKey, strconv.FormatInt(syncedAt, 10)); err != nil {
		return fmt.Errorf("update usage sync state: %w", err)
	}
	if err := pruneCleanHourlyUsageRows(ctx, tx, time.UnixMilli(syncedAt).UTC()); err != nil {
		return err
	}
	return tx.Commit()
}

// GetHourlyUsageSyncState returns the local usage persistence state.
func (s *HourlyUsageStore) GetHourlyUsageSyncState(ctx context.Context) (HourlyUsageSyncState, error) {
	state := HourlyUsageSyncState{}
	if err := s.database.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(is_dirty), 0) FROM token_usage_hourly`).Scan(&state.TotalRows, &state.DirtyRows); err != nil {
		return HourlyUsageSyncState{}, fmt.Errorf("query usage sync state: %w", err)
	}
	var raw string
	err := s.database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, hourlyUsageLastSyncMetadataKey).Scan(&raw)
	if err == sql.ErrNoRows {
		return state, nil
	}
	if err != nil {
		return HourlyUsageSyncState{}, fmt.Errorf("query last usage sync time: %w", err)
	}
	state.LastSuccessfulSyncAt, err = strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return HourlyUsageSyncState{}, fmt.Errorf("parse last usage sync time: %w", err)
	}
	return state, nil
}

func listAgentHourlyRows(ctx context.Context, tx *sql.Tx, agentKind string) ([]HourlyUsageRow, error) {
	rows, err := tx.QueryContext(ctx, `SELECT project_id, workspace_id, workspace_path, organization_id,
		agent_kind, model, model_normalized, bucket_start_hour_utc, input_tokens, output_tokens,
		cached_input_tokens, cached_write_tokens, reasoning_tokens, total_tokens, event_count,
		session_count, turn_count, tool_call_count, attribution_confidence, scanner_source_kind,
		scanner_source_id, ingested_at, run_id, updated_at, is_dirty, last_synced_at
		FROM token_usage_hourly WHERE agent_kind = ?`, agentKind)
	if err != nil {
		return nil, fmt.Errorf("query agent usage rows: %w", err)
	}
	defer rows.Close()
	return scanHourlyUsageRows(rows)
}

func scanHourlyUsageRows(rows *sql.Rows) ([]HourlyUsageRow, error) {
	out := make([]HourlyUsageRow, 0)
	for rows.Next() {
		var row HourlyUsageRow
		var isDirty int
		if err := rows.Scan(&row.ProjectID, &row.WorkspaceID, &row.WorkspacePath, &row.OrganizationID,
			&row.AgentKind, &row.Model, &row.ModelNormalized, &row.BucketStartHourUTC, &row.InputTokens,
			&row.OutputTokens, &row.CachedInputTokens, &row.CachedWriteTokens, &row.ReasoningTokens,
			&row.TotalTokens, &row.EventCount, &row.SessionCount, &row.TurnCount, &row.ToolCallCount,
			&row.AttributionConfidence, &row.ScannerSourceKind, &row.ScannerSourceID, &row.IngestedAt,
			&row.RunID, &row.UpdatedAt, &isDirty, &row.LastSyncedAt); err != nil {
			return nil, fmt.Errorf("scan usage row: %w", err)
		}
		row.Dirty = isDirty != 0
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate usage rows: %w", err)
	}
	sort.Slice(out, func(left int, right int) bool {
		return CompareHourlyUsageRows(out[left], out[right]) < 0
	})
	return out, nil
}

func upsertHourlyUsageRow(ctx context.Context, tx *sql.Tx, row HourlyUsageRow) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO token_usage_hourly (
		project_id, workspace_id, workspace_path, organization_id, agent_kind, model, model_normalized,
		bucket_start_hour_utc, input_tokens, output_tokens, cached_input_tokens, cached_write_tokens,
		reasoning_tokens, total_tokens, event_count, session_count, turn_count, tool_call_count,
		attribution_confidence, scanner_source_kind, scanner_source_id, ingested_at, run_id, updated_at,
		is_dirty, last_synced_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(project_id, workspace_id, agent_kind, model_normalized, bucket_start_hour_utc) DO UPDATE SET
		workspace_path = excluded.workspace_path, organization_id = excluded.organization_id, model = excluded.model,
		input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
		cached_input_tokens = excluded.cached_input_tokens, cached_write_tokens = excluded.cached_write_tokens,
		reasoning_tokens = excluded.reasoning_tokens, total_tokens = excluded.total_tokens, event_count = excluded.event_count,
		session_count = excluded.session_count, turn_count = excluded.turn_count, tool_call_count = excluded.tool_call_count,
		attribution_confidence = excluded.attribution_confidence, scanner_source_kind = excluded.scanner_source_kind,
		scanner_source_id = excluded.scanner_source_id, ingested_at = excluded.ingested_at, run_id = excluded.run_id,
		updated_at = excluded.updated_at, is_dirty = excluded.is_dirty, last_synced_at = excluded.last_synced_at`,
		row.ProjectID, row.WorkspaceID, row.WorkspacePath, row.OrganizationID, row.AgentKind, row.Model,
		row.ModelNormalized, row.BucketStartHourUTC, row.InputTokens, row.OutputTokens, row.CachedInputTokens,
		row.CachedWriteTokens, row.ReasoningTokens, row.TotalTokens, row.EventCount, row.SessionCount,
		row.TurnCount, row.ToolCallCount, row.AttributionConfidence, row.ScannerSourceKind, row.ScannerSourceID,
		row.IngestedAt, row.RunID, row.UpdatedAt, boolToInteger(row.Dirty), row.LastSyncedAt)
	if err != nil {
		return fmt.Errorf("upsert usage row: %w", err)
	}
	return nil
}

func pruneCleanHourlyUsageRows(ctx context.Context, tx *sql.Tx, now time.Time) error {
	retentionCutoff := now.Add(-HourlyUsageRetentionWindow).UnixMilli()
	if _, err := tx.ExecContext(ctx, `DELETE FROM token_usage_hourly WHERE is_dirty = 0 AND bucket_start_hour_utc < ?`, retentionCutoff); err != nil {
		return fmt.Errorf("prune clean usage rows: %w", err)
	}
	return nil
}

func boolToInteger(value bool) int {
	if value {
		return 1
	}
	return 0
}
