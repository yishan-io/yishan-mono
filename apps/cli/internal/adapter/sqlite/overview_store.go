package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

const overviewMicrosPerUSD = 1_000_000

// OverviewStore serves the desktop Overview aggregates from this device's
// token_usage_hourly and workspaces tables. It is read-only.
type OverviewStore struct {
	database *sql.DB
}

// NewOverviewStore creates a local Overview store backed by database.
func NewOverviewStore(database *sql.DB) *OverviewStore {
	return &OverviewStore{database: database}
}

// usageWhere builds the token_usage_hourly predicate (no leading WHERE) for
// filter. The optional alias prefixes every column, e.g. "u.".
func usageWhere(filter OverviewFilter, alias string) (string, []any) {
	clauses := []string{alias + "bucket_start_hour_utc >= ?", alias + "bucket_start_hour_utc <= ?"}
	args := []any{filter.Since.UnixMilli(), filter.Until.UnixMilli()}
	if filter.ProjectID != "" {
		clauses = append(clauses, alias+"project_id = ?")
		args = append(args, filter.ProjectID)
	}
	if filter.OrganizationID != "" {
		clauses = append(clauses, alias+"organization_id = ?")
		args = append(args, filter.OrganizationID)
	}
	return strings.Join(clauses, " AND "), args
}

// GetTokenUsageSeries returns usage buckets plus range totals. Day buckets
// are UTC-aligned.
func (s *OverviewStore) GetTokenUsageSeries(ctx context.Context, filter OverviewFilter, granularity OverviewGranularity) (OverviewTokenUsageResult, error) {
	bucketExpr := "bucket_start_hour_utc"
	if granularity == OverviewGranularityDay {
		bucketExpr = "(bucket_start_hour_utc / 86400000) * 86400000"
	}
	where, args := usageWhere(filter, "")
	query := fmt.Sprintf(`SELECT %s AS bucket,
		SUM(total_tokens), SUM(input_tokens), SUM(output_tokens), SUM(cached_input_tokens),
		SUM(cached_write_tokens), SUM(turn_count), SUM(tool_call_count), SUM(total_cost_micros_usd)
		FROM token_usage_hourly WHERE %s GROUP BY bucket ORDER BY bucket`, bucketExpr, where)
	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return OverviewTokenUsageResult{}, fmt.Errorf("query token usage series: %w", err)
	}
	defer rows.Close()
	result := OverviewTokenUsageResult{Series: []OverviewTokenUsageSeriesItem{}}
	var totalCostMicros int64
	for rows.Next() {
		item, costMicros, err := scanTokenUsageBucket(rows)
		if err != nil {
			return OverviewTokenUsageResult{}, err
		}
		result.addBucket(item)
		totalCostMicros += costMicros
		result.Series = append(result.Series, item)
	}
	if err := rows.Err(); err != nil {
		return OverviewTokenUsageResult{}, fmt.Errorf("iterate token usage series: %w", err)
	}
	result.UncachedTotal = max(0, result.GrandTotal-result.CachedTotal-result.CachedWriteTotal)
	result.TotalCostUSD = microsToUSD(totalCostMicros)
	return result, nil
}

func scanTokenUsageBucket(rows *sql.Rows) (OverviewTokenUsageSeriesItem, int64, error) {
	var item OverviewTokenUsageSeriesItem
	var bucketMillis, costMicros int64
	if err := rows.Scan(&bucketMillis, &item.TotalTokens, &item.InputTokens, &item.OutputTokens,
		&item.CachedInputTokens, &item.CachedWriteTokens, &item.TurnCount, &item.ToolCallCount, &costMicros); err != nil {
		return item, 0, fmt.Errorf("scan token usage bucket: %w", err)
	}
	item.BucketStartUtc = time.UnixMilli(bucketMillis).UTC().Format(time.RFC3339)
	item.TotalCostUSD = microsToUSD(costMicros)
	return item, costMicros, nil
}

func (result *OverviewTokenUsageResult) addBucket(item OverviewTokenUsageSeriesItem) {
	result.GrandTotal += item.TotalTokens
	result.CachedTotal += item.CachedInputTokens
	result.CachedWriteTotal += item.CachedWriteTokens
	result.TurnTotal += item.TurnCount
	result.ToolCallTotal += item.ToolCallCount
}

// GetModelBreakdown returns per (model, agent kind) totals ordered by tokens
// descending, with each row's share of the range total in percent.
func (s *OverviewStore) GetModelBreakdown(ctx context.Context, filter OverviewFilter) (OverviewModelBreakdownResult, error) {
	where, args := usageWhere(filter, "")
	rows, err := s.database.QueryContext(ctx, `SELECT model_normalized, agent_kind,
		SUM(total_tokens) AS tokens, SUM(input_tokens), SUM(output_tokens), SUM(total_cost_micros_usd)
		FROM token_usage_hourly WHERE `+where+`
		GROUP BY model_normalized, agent_kind ORDER BY tokens DESC, model_normalized, agent_kind`, args...)
	if err != nil {
		return OverviewModelBreakdownResult{}, fmt.Errorf("query model breakdown: %w", err)
	}
	defer rows.Close()
	result := OverviewModelBreakdownResult{Models: []OverviewModelBreakdownItem{}}
	var grandTotal int64
	for rows.Next() {
		var item OverviewModelBreakdownItem
		var costMicros int64
		if err := rows.Scan(&item.ModelNormalized, &item.AgentKind, &item.TotalTokens,
			&item.InputTokens, &item.OutputTokens, &costMicros); err != nil {
			return OverviewModelBreakdownResult{}, fmt.Errorf("scan model breakdown row: %w", err)
		}
		item.TotalCostUSD = microsToUSD(costMicros)
		grandTotal += item.TotalTokens
		result.Models = append(result.Models, item)
	}
	if err := rows.Err(); err != nil {
		return OverviewModelBreakdownResult{}, fmt.Errorf("iterate model breakdown: %w", err)
	}
	for i := range result.Models {
		result.Models[i].Percentage = percentOf(result.Models[i].TotalTokens, grandTotal)
	}
	return result, nil
}

func percentOf(part, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(float64(part)/float64(total)*10000) / 100
}

func microsToUSD(micros int64) float64 {
	return float64(micros) / overviewMicrosPerUSD
}
