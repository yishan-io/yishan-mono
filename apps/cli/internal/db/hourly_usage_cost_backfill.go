package db

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"time"
)

const (
	// UsageCostBackfillVersion is the current historical cost backfill version.
	// Bump it to force a re-run of the (idempotent) backfill; the version is
	// stored as the VALUE of the completed marker, so no new metadata keys are
	// ever introduced.
	UsageCostBackfillVersion                    = "v4"
	hourlyUsageCostBackfillStartedAtMetadataKey = "token_usage_cost_backfill_started_at"
	hourlyUsageCostBackfillCompletedMetadataKey = "token_usage_cost_backfill_completed"
)

type HourlyUsageCostEstimator func(row HourlyUsageRow) int64

type CostBackfillOptions struct {
	RecomputeEstimated bool
}

func (s *HourlyUsageStore) EnsureCostBackfillStartedAt(ctx context.Context, startedAt int64) (int64, error) {
	var existing string
	err := s.database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, hourlyUsageCostBackfillStartedAtMetadataKey).Scan(&existing)
	if err == nil {
		parsed, parseErr := strconv.ParseInt(existing, 10, 64)
		if parseErr != nil {
			return 0, fmt.Errorf("parse usage cost backfill started-at metadata: %w", parseErr)
		}
		return parsed, nil
	}
	if err != sql.ErrNoRows {
		return 0, fmt.Errorf("read usage cost backfill started-at metadata: %w", err)
	}
	if startedAt <= 0 {
		startedAt = time.Now().UTC().UnixMilli()
	}
	if _, err := s.database.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?)`, hourlyUsageCostBackfillStartedAtMetadataKey, strconv.FormatInt(startedAt, 10)); err != nil {
		return 0, fmt.Errorf("write usage cost backfill started-at metadata: %w", err)
	}
	return startedAt, nil
}

func (s *HourlyUsageStore) CostBackfillCompleted(ctx context.Context) (bool, error) {
	value, hasKey, err := getMetadataKey(ctx, s.database, hourlyUsageCostBackfillCompletedMetadataKey)
	if err != nil {
		return false, fmt.Errorf("read usage cost backfill completed metadata: %w", err)
	}
	return hasKey && value == UsageCostBackfillVersion, nil
}

// MarkCostBackfillCompleted records the current backfill version as complete.
func (s *HourlyUsageStore) MarkCostBackfillCompleted(ctx context.Context) error {
	_, err := s.database.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, hourlyUsageCostBackfillCompletedMetadataKey, UsageCostBackfillVersion)
	if err != nil {
		return fmt.Errorf("write usage cost backfill completed metadata: %w", err)
	}
	return nil
}

func (s *HourlyUsageStore) BackfillEstimatedCost(
	ctx context.Context,
	updatedBefore int64,
	estimate HourlyUsageCostEstimator,
	options CostBackfillOptions,
) (int, error) {
	if estimate == nil {
		return 0, nil
	}
	tx, err := s.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin usage cost backfill: %w", err)
	}
	defer tx.Rollback()

	queryRows, err := tx.QueryContext(ctx, `SELECT project_id, workspace_id, workspace_path, organization_id,
		agent_kind, model, model_normalized, bucket_start_hour_utc, input_tokens, output_tokens,
		cached_input_tokens, cached_write_tokens, reasoning_tokens, total_tokens, total_cost_micros_usd, cost_source, event_count,
		session_count, turn_count, tool_call_count, attribution_confidence, scanner_source_kind,
		scanner_source_id, ingested_at, run_id, updated_at, is_dirty, last_synced_at
		FROM token_usage_hourly
		WHERE total_tokens > 0 AND bucket_start_hour_utc < ? AND cost_source != ? AND (? = 1 OR total_cost_micros_usd = 0)`, updatedBefore, CostSourceDirect, boolToInteger(options.RecomputeEstimated))
	if err != nil {
		return 0, fmt.Errorf("query usage cost backfill candidates: %w", err)
	}
	defer queryRows.Close()

	rows, err := scanHourlyUsageRows(queryRows)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		if err := tx.Commit(); err != nil {
			return 0, fmt.Errorf("commit empty usage cost backfill: %w", err)
		}
		return 0, nil
	}

	now := time.Now().UTC().UnixMilli()
	updatedCount := 0
	for _, row := range rows {
		estimatedCost := estimate(row)
		if estimatedCost <= 0 {
			continue
		}
		if row.TotalCostMicrosUSD == estimatedCost && normalizedCostSource(row.CostSource) == CostSourceEstimated {
			continue
		}
		row.TotalCostMicrosUSD = estimatedCost
		row.CostSource = CostSourceEstimated
		row.UpdatedAt = now
		row.Dirty = true
		if err := upsertHourlyUsageRow(ctx, tx, row); err != nil {
			return 0, err
		}
		updatedCount++
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit usage cost backfill: %w", err)
	}
	return updatedCount, nil
}
