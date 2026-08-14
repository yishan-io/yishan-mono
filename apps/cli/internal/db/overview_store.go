package db

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// OverviewStore provides local aggregate queries for the desktop Overview view.
const usdMicrosPerUSD = 1_000_000

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
		COALESCE(SUM(turn_count), 0), COALESCE(SUM(tool_call_count), 0), COALESCE(SUM(total_cost_micros_usd), 0)
		FROM token_usage_hourly WHERE bucket_start_hour_utc >= ?%s
		GROUP BY bucket ORDER BY bucket`, bucketExpr, projectFilter)

	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query token usage series: %w", err)
	}
	defer rows.Close()

	result := &OverviewTokenUsageResult{}
	var totalCostMicrosUSD int64
	for rows.Next() {
		var bucketMillis int64
		var item OverviewTokenUsageSeriesItem
		var bucketCostMicrosUSD int64
		if err := rows.Scan(&bucketMillis, &item.TotalTokens, &item.InputTokens, &item.OutputTokens,
			&item.CachedInputTokens, &item.CachedWriteTokens, &item.TurnCount, &item.ToolCallCount, &bucketCostMicrosUSD); err != nil {
			return nil, fmt.Errorf("scan token usage series row: %w", err)
		}
		item.BucketStartUtc = time.UnixMilli(bucketMillis).UTC().Format(time.RFC3339)
		item.TotalCostUSD = microsToUSD(bucketCostMicrosUSD)
		result.Series = append(result.Series, item)
		result.GrandTotal += item.TotalTokens
		result.CachedTotal += item.CachedInputTokens
		result.CachedWriteTotal += item.CachedWriteTokens
		result.TurnTotal += item.TurnCount
		result.ToolCallTotal += item.ToolCallCount
		totalCostMicrosUSD += bucketCostMicrosUSD
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate token usage series: %w", err)
	}
	result.UncachedTotal = result.GrandTotal - result.CachedTotal - result.CachedWriteTotal
	if result.UncachedTotal < 0 {
		result.UncachedTotal = 0
	}
	result.TotalCostUSD = microsToUSD(totalCostMicrosUSD)
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
		COALESCE(SUM(total_tokens), 0), COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), COALESCE(SUM(total_cost_micros_usd), 0)
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
		var totalCostMicrosUSD int64
		if err := rows.Scan(&item.ModelNormalized, &item.AgentKind, &item.TotalTokens, &item.InputTokens, &item.OutputTokens, &totalCostMicrosUSD); err != nil {
			return nil, fmt.Errorf("scan model breakdown row: %w", err)
		}
		item.TotalCostUSD = microsToUSD(totalCostMicrosUSD)
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
		return nil, fmt.Errorf("iterate closed workspaces: %w", err)
	}
	closedRows.Close() // release cursor before follow-up queries

	// Batch project names and token totals.
	projectIDs := make([]string, len(closedRowsData))
	wsIDs := make([]string, len(closedRowsData))
	for i, cr := range closedRowsData {
		projectIDs[i] = cr.projectID
		wsIDs[i] = cr.id
	}
	projectNames := s.projectNames(ctx, projectIDs)
	workspaceTokens := s.workspaceTokenTotals(ctx, wsIDs)
	workspaceCosts := s.workspaceCostTotals(ctx, wsIDs)

	for _, cr := range closedRowsData {
		projectName := projectNames[cr.projectID]
		if projectName == "" {
			projectName = cr.projectID
		}
		totalTokens := workspaceTokens[cr.id]
		totalCostUSD := microsToUSD(workspaceCosts[cr.id])

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
			TotalCostUSD:  totalCostUSD,
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
		key := pg.projectID + "\x00" + pg.localPath
		if _, exists := groups[key]; !exists {
			groups[key] = pg
			groupKeys = append(groupKeys, key)
		}
	}
	if err := primaryRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate primary workspaces: %w", err)
	}
	result.PrimaryWorkspaceCount = len(groups)

	// Compute range-bounded token/cost totals per group, sort top 10.
	type primaryToken struct {
		pg         primaryGroup
		tokens     int64
		costMicros int64
	}
	var primaryTokens []primaryToken
	for _, key := range groupKeys {
		pg := groups[key]
		tokens := s.workspacePathTokenTotal(ctx, key, cutoffMillis)
		costMicros := s.workspacePathCostTotal(ctx, key, cutoffMillis)
		primaryTokens = append(primaryTokens, primaryToken{pg: pg, tokens: tokens, costMicros: costMicros})
		result.PrimaryWorkspaceTokens += tokens
	}

	// Sort: tokens desc, then representative id asc for tie-break.
	sort.Slice(primaryTokens, func(i, j int) bool {
		if primaryTokens[i].tokens != primaryTokens[j].tokens {
			return primaryTokens[i].tokens > primaryTokens[j].tokens
		}
		return primaryTokens[i].pg.id < primaryTokens[j].pg.id
	})
	// Batch project names and token totals for primary workspaces.
	primaryProjectIDs := make([]string, 0, len(primaryTokens))
	for _, pt := range primaryTokens {
		primaryProjectIDs = append(primaryProjectIDs, pt.pg.projectID)
	}
	primaryProjectNames := s.projectNames(ctx, primaryProjectIDs)

	limit := 10
	if len(primaryTokens) < limit {
		limit = len(primaryTokens)
	}
	for i := 0; i < limit; i++ {
		pt := primaryTokens[i]
		projectName := primaryProjectNames[pt.pg.projectID]
		if projectName == "" {
			projectName = pt.pg.projectID
		}
		result.TopPrimaryWorkspaces = append(result.TopPrimaryWorkspaces, OverviewPrimaryWorkspaceItem{
			ID:           pt.pg.id,
			ProjectID:    pt.pg.projectID,
			ProjectName:  projectName,
			Branch:       pt.pg.branch,
			CreatedAt:    pt.pg.createdAt,
			TotalTokens:  pt.tokens,
			TotalCostUSD: microsToUSD(pt.costMicros),
		})
	}

	return result, nil
}

func (s *OverviewStore) projectNames(ctx context.Context, ids []string) map[string]string {
	// The local projects table is gone (projects are remote-authoritative), so
	// resolve names to the id as a fallback. The remote overview (zaa40)
	// replaces this path.
	names := make(map[string]string, len(ids))
	for _, id := range ids {
		names[id] = id
	}
	return names
}

func (s *OverviewStore) workspaceTokenTotals(ctx context.Context, ids []string) map[string]int64 {
	if len(ids) == 0 {
		return nil
	}
	totals := make(map[string]int64, len(ids))
	query, args := buildInQuery(`SELECT workspace_id, COALESCE(SUM(total_tokens), 0) FROM token_usage_hourly WHERE workspace_id IN`, ids)
	query += " GROUP BY workspace_id"
	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return totals
	}
	defer rows.Close()
	for rows.Next() {
		var wsID string
		var total int64
		if err := rows.Scan(&wsID, &total); err == nil {
			totals[wsID] = total
		}
	}
	return totals
}

func (s *OverviewStore) workspaceCostTotals(ctx context.Context, ids []string) map[string]int64 {
	if len(ids) == 0 {
		return nil
	}
	totals := make(map[string]int64, len(ids))
	query, args := buildInQuery(
		`SELECT workspace_id, COALESCE(SUM(total_cost_micros_usd), 0) FROM token_usage_hourly WHERE workspace_id IN`,
		ids,
	)
	query += " GROUP BY workspace_id"
	rows, err := s.database.QueryContext(ctx, query, args...)
	if err != nil {
		return totals
	}
	defer rows.Close()
	for rows.Next() {
		var wsID string
		var total int64
		if err := rows.Scan(&wsID, &total); err == nil {
			totals[wsID] = total
		}
	}
	return totals
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

func (s *OverviewStore) workspacePathCostTotal(ctx context.Context, groupKey string, cutoffMillis int64) int64 {
	var total int64
	parts := splitGroupKey(groupKey)
	_ = s.database.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(total_cost_micros_usd), 0) FROM token_usage_hourly
		 WHERE project_id = ? AND workspace_path = ? AND bucket_start_hour_utc >= ?`,
		parts[0], parts[1], cutoffMillis).Scan(&total)
	return total
}

func buildInQuery(prefix string, ids []string) (string, []any) {
	placeholders := make([]string, len(ids))
	for i := range placeholders {
		placeholders[i] = "?"
	}
	return prefix + " (" + strings.Join(placeholders, ", ") + ")", idsToAny(ids)
}

func idsToAny(ids []string) []any {
	out := make([]any, len(ids))
	for i, id := range ids {
		out[i] = id
	}
	return out
}

func microsToUSD(totalMicros int64) float64 {
	if totalMicros == 0 {
		return 0
	}
	return float64(totalMicros) / usdMicrosPerUSD
}

func splitGroupKey(key string) [2]string {
	parts := strings.SplitN(key, "\x00", 2)
	if len(parts) == 2 {
		return [2]string{parts[0], parts[1]}
	}
	return [2]string{key, ""}
}
