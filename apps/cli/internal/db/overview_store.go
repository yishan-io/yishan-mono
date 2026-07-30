package db

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"time"
)

// OverviewStore provides local aggregate queries for the desktop Overview view.
type OverviewStore struct {
	database *sql.DB
}

// NewOverviewStore creates a local overview store backed by database.
func NewOverviewStore(database *sql.DB) *OverviewStore {
	return &OverviewStore{database: database}
}

// ─── Token Usage ────────────────────────────────────────────────────────────────

// GetTokenUsageSeries returns aggregated token usage buckets for the requested range and granularity.
func (s *OverviewStore) GetTokenUsageSeries(
	ctx context.Context,
	rangeDays int,
	projectID string,
	granularity string,
) (*OverviewTokenUsageResult, error) {
	cutoffMillis := time.Now().UTC().Add(-time.Duration(rangeDays) * 24 * time.Hour).UnixMilli()

	bucketExpr := "bucket_start_hour_utc"
	if granularity == "day" {
		bucketExpr = "(bucket_start_hour_utc / 86400000) * 86400000"
	}

	projectFilter := ""
	args := []any{cutoffMillis}
	if projectID != "" {
		projectFilter = " AND project_id = ?"
		args = append(args, projectID)
	}

	query := fmt.Sprintf(`SELECT %s AS bucket,
		COALESCE(SUM(total_tokens), 0), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0),
		COALESCE(SUM(cached_input_tokens), 0), COALESCE(SUM(cached_write_tokens), 0),
		COALESCE(SUM(turn_count), 0), COALESCE(SUM(tool_call_count), 0)
		FROM token_usage_hourly WHERE bucket_start_hour_utc >= ?%s
		GROUP BY bucket ORDER BY bucket`, bucketExpr, projectFilter)

	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query token usage series: %w", err)
	}
	defer rows.Close()

	result := &OverviewTokenUsageResult{}
	for rows.Next() {
		var bucketMillis int64
		var item OverviewTokenUsageSeriesItem
		if err := rows.Scan(&bucketMillis, &item.TotalTokens, &item.InputTokens, &item.OutputTokens,
			&item.CachedInputTokens, &item.CachedWriteTokens, &item.TurnCount, &item.ToolCallCount); err != nil {
			return nil, fmt.Errorf("scan token usage series row: %w", err)
		}
		item.BucketStartUtc = time.UnixMilli(bucketMillis).UTC().Format(time.RFC3339)
		result.Series = append(result.Series, item)
		result.GrandTotal += item.TotalTokens
		result.CachedTotal += item.CachedInputTokens
		result.TurnTotal += item.TurnCount
		result.ToolCallTotal += item.ToolCallCount
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate token usage series: %w", err)
	}
	result.CachedWriteTotal = result.CachedTotal // not tracked separately in local schema
	result.UncachedTotal = result.GrandTotal - result.CachedTotal
	if result.UncachedTotal < 0 {
		result.UncachedTotal = 0
	}
	return result, nil
}

// ─── Model Breakdown ────────────────────────────────────────────────────────────

// GetModelBreakdown returns per-model token totals and percentages for the requested range.
func (s *OverviewStore) GetModelBreakdown(
	ctx context.Context,
	rangeDays int,
	projectID string,
) (*OverviewModelBreakdownResult, error) {
	cutoffMillis := time.Now().UTC().Add(-time.Duration(rangeDays) * 24 * time.Hour).UnixMilli()

	projectFilter := ""
	args := []any{cutoffMillis}
	if projectID != "" {
		projectFilter = " AND project_id = ?"
		args = append(args, projectID)
	}

	query := fmt.Sprintf(`SELECT model_normalized, agent_kind,
		COALESCE(SUM(total_tokens), 0), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0)
		FROM token_usage_hourly WHERE bucket_start_hour_utc >= ?%s
		GROUP BY model_normalized, agent_kind ORDER BY SUM(total_tokens) DESC`, projectFilter)

	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query model breakdown: %w", err)
	}
	defer rows.Close()

	result := &OverviewModelBreakdownResult{}
	var grandTotal int64
	for rows.Next() {
		var item OverviewModelBreakdownItem
		if err := rows.Scan(&item.ModelNormalized, &item.AgentKind, &item.TotalTokens, &item.InputTokens, &item.OutputTokens); err != nil {
			return nil, fmt.Errorf("scan model breakdown row: %w", err)
		}
		result.Models = append(result.Models, item)
		grandTotal += item.TotalTokens
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate model breakdown: %w", err)
	}
	for i := range result.Models {
		if grandTotal > 0 {
			result.Models[i].Percentage = math.Round(float64(result.Models[i].TotalTokens)/float64(grandTotal)*10000) / 100
		}
	}
	return result, nil
}

// ─── Agent Kind Breakdown ───────────────────────────────────────────────────────

// GetAgentKindBreakdown returns per-agent-kind token totals and percentages.
func (s *OverviewStore) GetAgentKindBreakdown(
	ctx context.Context,
	rangeDays int,
	projectID string,
) (*OverviewAgentKindBreakdownResult, error) {
	cutoffMillis := time.Now().UTC().Add(-time.Duration(rangeDays) * 24 * time.Hour).UnixMilli()

	projectFilter := ""
	args := []any{cutoffMillis}
	if projectID != "" {
		projectFilter = " AND project_id = ?"
		args = append(args, projectID)
	}

	query := fmt.Sprintf(`SELECT agent_kind,
		COALESCE(SUM(total_tokens), 0), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0)
		FROM token_usage_hourly WHERE bucket_start_hour_utc >= ?%s
		GROUP BY agent_kind ORDER BY SUM(total_tokens) DESC`, projectFilter)

	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query agent kind breakdown: %w", err)
	}
	defer rows.Close()

	result := &OverviewAgentKindBreakdownResult{}
	var grandTotal int64
	for rows.Next() {
		var item OverviewAgentKindBreakdownItem
		if err := rows.Scan(&item.AgentKind, &item.TotalTokens, &item.InputTokens, &item.OutputTokens); err != nil {
			return nil, fmt.Errorf("scan agent kind breakdown row: %w", err)
		}
		result.AgentKinds = append(result.AgentKinds, item)
		grandTotal += item.TotalTokens
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agent kind breakdown: %w", err)
	}
	for i := range result.AgentKinds {
		if grandTotal > 0 {
			result.AgentKinds[i].Percentage = math.Round(float64(result.AgentKinds[i].TotalTokens)/float64(grandTotal)*10000) / 100
		}
	}
	return result, nil
}

// ─── Workspace Insights ─────────────────────────────────────────────────────────

// GetWorkspaceInsights returns closed and primary workspace statistics for the Overview.
func (s *OverviewStore) GetWorkspaceInsights(
	ctx context.Context,
	rangeDays int,
	projectID string,
) (*OverviewWorkspaceInsightsResult, error) {
	cutoffMillis := time.Now().UTC().Add(-time.Duration(rangeDays) * 24 * time.Hour).UnixMilli()
	cutoffText := time.UnixMilli(cutoffMillis).UTC().Format("2006-01-02 15:04:05")

	result := &OverviewWorkspaceInsightsResult{}

	// Closed workspaces
	closedProjectFilter := ""
	closedArgs := []any{cutoffText}
	if projectID != "" {
		closedProjectFilter = " AND project_id = ?"
		closedArgs = append(closedArgs, projectID)
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM workspaces WHERE status = 'closed' AND updated_at >= ?%s`, closedProjectFilter)
	if err := s.database.QueryRowContext(ctx, countQuery, closedArgs...).Scan(&result.ClosedWorkspaceCount); err != nil {
		return nil, fmt.Errorf("count closed workspaces: %w", err)
	}

	avgQuery := fmt.Sprintf(`SELECT COALESCE(AVG(strftime('%%s', updated_at) - strftime('%%s', created_at)) / 3600.0, 0) FROM workspaces WHERE status = 'closed' AND updated_at >= ?%s`, closedProjectFilter)
	var avgHours float64
	if err := s.database.QueryRowContext(ctx, avgQuery, closedArgs...).Scan(&avgHours); err != nil {
		return nil, fmt.Errorf("average closed workspace lifetime: %w", err)
	}
	if result.ClosedWorkspaceCount > 0 {
		avg := math.Round(avgHours*10) / 10
		result.AverageLifetimeHours = &avg
	}

	closedQuery := fmt.Sprintf(`SELECT id, project_id, branch, created_at, updated_at
		FROM workspaces WHERE status = 'closed' AND updated_at >= ?%s
		ORDER BY updated_at DESC LIMIT 10`, closedProjectFilter)

	closedRows, err := s.database.QueryContext(ctx, closedQuery, closedArgs...)
	if err != nil {
		return nil, fmt.Errorf("query closed workspaces: %w", err)
	}
	defer closedRows.Close()

	type closedRow struct {
		id, projectID, createdAt, closedAt string
		branch                             *string
	}
	var closedRowsData []closedRow
	for closedRows.Next() {
		var cr closedRow
		if err := closedRows.Scan(&cr.id, &cr.projectID, &cr.branch, &cr.createdAt, &cr.closedAt); err != nil {
			return nil, fmt.Errorf("scan closed workspace: %w", err)
		}
		closedRowsData = append(closedRowsData, cr)
	}
	if err := closedRows.Err(); err != nil {
	}

	for _, cr := range closedRowsData {
		projectName := s.projectName(ctx, cr.projectID)
		totalTokens := s.workspaceTokenTotal(ctx, cr.id)

		createdAt, _ := time.Parse("2006-01-02 15:04:05", cr.createdAt)
		closedAt, _ := time.Parse("2006-01-02 15:04:05", cr.closedAt)
		lifetimeHours := closedAt.Sub(createdAt).Hours()
		if lifetimeHours < 0 {
			lifetimeHours = 0
		}
		lifetimeHours = math.Round(lifetimeHours*10) / 10

		result.LastClosedWorkspaces = append(result.LastClosedWorkspaces, OverviewClosedWorkspaceItem{
			ID:            cr.id,
			ProjectID:     cr.projectID,
			ProjectName:   projectName,
			Branch:        cr.branch,
			CreatedAt:     cr.createdAt,
			ClosedAt:      cr.closedAt,
			LifetimeHours: lifetimeHours,
			TotalTokens:   totalTokens,
		})
	}

	// Primary workspaces: group by (project_id, local_path), pick newest active row.
	primaryProjectFilter := ""
	primaryArgs := []any{}
	if projectID != "" {
		primaryProjectFilter = " AND project_id = ?"
		primaryArgs = append(primaryArgs, projectID)
	}

	primaryQuery := fmt.Sprintf(`SELECT id, project_id, branch, created_at, local_path
		FROM workspaces WHERE kind = 'primary' AND status = 'active'%s
		ORDER BY project_id, local_path, created_at DESC`, primaryProjectFilter)

	primaryRows, err := s.database.QueryContext(ctx, primaryQuery, primaryArgs...)
	if err != nil {
		return nil, fmt.Errorf("query primary workspaces: %w", err)
	}
	defer primaryRows.Close()

	type primaryGroup struct {
		id, projectID, localPath, createdAt string
		branch                              *string
	}
	groups := make(map[string]primaryGroup) // key: projectID|localPath
	var groupKeys []string
	for primaryRows.Next() {
		var pg primaryGroup
		if err := primaryRows.Scan(&pg.id, &pg.projectID, &pg.branch, &pg.createdAt, &pg.localPath); err != nil {
			return nil, fmt.Errorf("scan primary workspace: %w", err)
		}
		key := pg.projectID + "|" + pg.localPath
		if _, exists := groups[key]; !exists {
			groups[key] = pg
			groupKeys = append(groupKeys, key)
		}
	}
	if err := primaryRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate primary workspaces: %w", err)
	}
	result.PrimaryWorkspaceCount = len(groups)

	// Compute range-bounded token totals per group, sort top 10.
	type primaryToken struct {
		pg     primaryGroup
		tokens int64
	}
	var primaryTokens []primaryToken
	for _, key := range groupKeys {
		pg := groups[key]
		tokens := s.workspacePathTokenTotal(ctx, key, cutoffMillis)
		primaryTokens = append(primaryTokens, primaryToken{pg: pg, tokens: tokens})
		result.PrimaryWorkspaceTokens += tokens
	}

	// Sort: tokens desc, then representative id asc for tie-break.
	for i := 0; i < len(primaryTokens); i++ {
		for j := i + 1; j < len(primaryTokens); j++ {
			if primaryTokens[j].tokens > primaryTokens[i].tokens ||
				(primaryTokens[j].tokens == primaryTokens[i].tokens && primaryTokens[j].pg.id < primaryTokens[i].pg.id) {
				primaryTokens[i], primaryTokens[j] = primaryTokens[j], primaryTokens[i]
			}
		}
	}
	limit := 10
	if len(primaryTokens) < limit {
		limit = len(primaryTokens)
	}
	for i := 0; i < limit; i++ {
		pt := primaryTokens[i]
		result.TopPrimaryWorkspaces = append(result.TopPrimaryWorkspaces, OverviewPrimaryWorkspaceItem{
			ID:          pt.pg.id,
			ProjectID:   pt.pg.projectID,
			ProjectName: s.projectName(ctx, pt.pg.projectID),
			Branch:      pt.pg.branch,
			CreatedAt:   pt.pg.createdAt,
			TotalTokens: pt.tokens,
		})
	}

	return result, nil
}

func (s *OverviewStore) projectName(ctx context.Context, projectID string) string {
	var name string
	if err := s.database.QueryRowContext(ctx, `SELECT name FROM projects WHERE id = ?`, projectID).Scan(&name); err != nil {
		return projectID
	}
	return name
}

func (s *OverviewStore) workspaceTokenTotal(ctx context.Context, workspaceID string) int64 {
	var total int64
	_ = s.database.QueryRowContext(ctx, `SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage_hourly WHERE workspace_id = ?`, workspaceID).Scan(&total)
	return total
}

func (s *OverviewStore) workspacePathTokenTotal(ctx context.Context, groupKey string, cutoffMillis int64) int64 {
	var total int64
	parts := splitGroupKey(groupKey)
	_ = s.database.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage_hourly
		 WHERE project_id = ? AND workspace_path = ? AND bucket_start_hour_utc >= ?`,
		parts[0], parts[1], cutoffMillis).Scan(&total)
	return total
}

func splitGroupKey(key string) [2]string {
	for i := 0; i < len(key); i++ {
		if key[i] == '|' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}
