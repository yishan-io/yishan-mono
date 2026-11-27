package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

const (
	overviewInsightListLimit = 10
	sqliteDateTimeLayout     = "2006-01-02 15:04:05"
)

// GetWorkspaceInsights returns closed-workspace statistics from local
// workspace rows and primary-workspace statistics derived from local usage.
// ProjectName carries the project ID; the caller owns resolving display names.
func (s *OverviewStore) GetWorkspaceInsights(ctx context.Context, filter OverviewFilter) (OverviewWorkspaceInsightsResult, error) {
	result := OverviewWorkspaceInsightsResult{
		LastClosedWorkspaces: []OverviewClosedWorkspaceItem{},
		TopPrimaryWorkspaces: []OverviewPrimaryWorkspaceItem{},
	}
	if err := s.loadClosedSummary(ctx, filter, &result); err != nil {
		return OverviewWorkspaceInsightsResult{}, err
	}
	closed, err := s.listLastClosed(ctx, filter)
	if err != nil {
		return OverviewWorkspaceInsightsResult{}, err
	}
	result.LastClosedWorkspaces = closed
	if err := s.loadPrimaryWorkspaces(ctx, filter, &result); err != nil {
		return OverviewWorkspaceInsightsResult{}, err
	}
	return result, nil
}

// workspaceScope builds the workspaces predicate for project/org scoping.
func workspaceScope(filter OverviewFilter, alias string) (string, []any) {
	clauses := []string{}
	args := []any{}
	if filter.ProjectID != "" {
		clauses = append(clauses, alias+"project_id = ?")
		args = append(args, filter.ProjectID)
	}
	if filter.OrganizationID != "" {
		clauses = append(clauses, alias+"organization_id = ?")
		args = append(args, filter.OrganizationID)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " AND " + strings.Join(clauses, " AND "), args
}

// closedWhere selects closed workspaces whose close time (updated_at) falls in
// the filter range.
func closedWhere(filter OverviewFilter, alias string) (string, []any) {
	scope, scopeArgs := workspaceScope(filter, alias)
	where := alias + "status = 'closed' AND " + alias + "updated_at >= ? AND " + alias + "updated_at <= ?" + scope
	args := append([]any{formatSQLiteTime(filter.Since), formatSQLiteTime(filter.Until)}, scopeArgs...)
	return where, args
}

func (s *OverviewStore) loadClosedSummary(ctx context.Context, filter OverviewFilter, result *OverviewWorkspaceInsightsResult) error {
	where, args := closedWhere(filter, "")
	var averageHours sql.NullFloat64
	err := s.database.QueryRowContext(ctx, `SELECT COUNT(*),
		AVG(MAX(0, julianday(updated_at) - julianday(created_at)) * 24)
		FROM workspaces WHERE `+where, args...).Scan(&result.ClosedWorkspaceCount, &averageHours)
	if err != nil {
		return fmt.Errorf("summarize closed workspaces: %w", err)
	}
	if averageHours.Valid {
		rounded := roundTenth(averageHours.Float64)
		result.AverageLifetimeHours = &rounded
	}
	return nil
}

// listLastClosed returns the most recently closed workspaces with their
// all-time usage totals.
func (s *OverviewStore) listLastClosed(ctx context.Context, filter OverviewFilter) ([]OverviewClosedWorkspaceItem, error) {
	where, args := closedWhere(filter, "w.")
	rows, err := s.database.QueryContext(ctx, `SELECT w.id, COALESCE(w.project_id, ''), w.branch, w.created_at, w.updated_at,
		COALESCE(SUM(u.total_tokens), 0), COALESCE(SUM(u.total_cost_micros_usd), 0)
		FROM workspaces w LEFT JOIN token_usage_hourly u ON u.workspace_id = w.id
		WHERE `+where+` GROUP BY w.id ORDER BY w.updated_at DESC, w.id LIMIT ?`,
		append(args, overviewInsightListLimit)...)
	if err != nil {
		return nil, fmt.Errorf("query closed workspaces: %w", err)
	}
	defer rows.Close()
	items := []OverviewClosedWorkspaceItem{}
	for rows.Next() {
		item, err := scanClosedWorkspace(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate closed workspaces: %w", err)
	}
	return items, nil
}

func scanClosedWorkspace(rows *sql.Rows) (OverviewClosedWorkspaceItem, error) {
	var item OverviewClosedWorkspaceItem
	var branch sql.NullString
	var createdAt, closedAt string
	var costMicros int64
	if err := rows.Scan(&item.ID, &item.ProjectID, &branch, &createdAt, &closedAt, &item.TotalTokens, &costMicros); err != nil {
		return item, fmt.Errorf("scan closed workspace: %w", err)
	}
	created, closed := parseSQLiteTime(createdAt), parseSQLiteTime(closedAt)
	item.ProjectName = item.ProjectID
	item.Branch = nullStringPtr(branch)
	item.CreatedAt = formatAPITime(created, createdAt)
	item.ClosedAt = formatAPITime(closed, closedAt)
	item.LifetimeHours = roundTenth(max(0, closed.Sub(created).Hours()))
	item.TotalCostUSD = microsToUSD(costMicros)
	return item, nil
}

// primaryWorkspacesQuery derives primary workspaces from usage. Primary
// workspace records are remote-authoritative and usually have no local row, so
// usage whose workspace has no local row (or a local primary row) is grouped
// by (project, path). Local worktree/folder rows and unattributed usage are
// excluded. The most recently active workspace ID represents each group;
// createdAt is the group's first usage bucket in range.
const primaryWorkspacesQuery = `WITH usage AS (
	SELECT u.project_id, u.workspace_path, u.workspace_id,
		MIN(u.bucket_start_hour_utc) AS first_seen, MAX(u.bucket_start_hour_utc) AS last_seen,
		SUM(u.total_tokens) AS tokens, SUM(u.total_cost_micros_usd) AS cost
	FROM token_usage_hourly u LEFT JOIN workspaces w ON w.id = u.workspace_id
	WHERE %s AND u.project_id <> 'unknown' AND u.workspace_path <> '' AND (w.id IS NULL OR w.kind = 'primary')
	GROUP BY u.project_id, u.workspace_path, u.workspace_id
), grouped AS (
	SELECT workspace_id, project_id,
		ROW_NUMBER() OVER (PARTITION BY project_id, workspace_path ORDER BY last_seen DESC, workspace_id) AS rn,
		MIN(first_seen) OVER (PARTITION BY project_id, workspace_path) AS group_first_seen,
		SUM(tokens) OVER (PARTITION BY project_id, workspace_path) AS group_tokens,
		SUM(cost) OVER (PARTITION BY project_id, workspace_path) AS group_cost
	FROM usage
)
SELECT g.workspace_id, g.project_id, w.branch, g.group_first_seen, g.group_tokens, g.group_cost
FROM grouped g LEFT JOIN workspaces w ON w.id = g.workspace_id
WHERE g.rn = 1 ORDER BY g.group_tokens DESC, g.workspace_id`

func (s *OverviewStore) loadPrimaryWorkspaces(ctx context.Context, filter OverviewFilter, result *OverviewWorkspaceInsightsResult) error {
	usage, usageArgs := usageWhere(filter, "u.")
	rows, err := s.database.QueryContext(ctx, fmt.Sprintf(primaryWorkspacesQuery, usage), usageArgs...)
	if err != nil {
		return fmt.Errorf("query primary workspaces: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		item, err := scanPrimaryWorkspace(rows)
		if err != nil {
			return err
		}
		result.PrimaryWorkspaceCount++
		result.PrimaryWorkspaceTokens += item.TotalTokens
		if len(result.TopPrimaryWorkspaces) < overviewInsightListLimit {
			result.TopPrimaryWorkspaces = append(result.TopPrimaryWorkspaces, item)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate primary workspaces: %w", err)
	}
	return nil
}

func scanPrimaryWorkspace(rows *sql.Rows) (OverviewPrimaryWorkspaceItem, error) {
	var item OverviewPrimaryWorkspaceItem
	var branch sql.NullString
	var firstSeenMillis, costMicros int64
	if err := rows.Scan(&item.ID, &item.ProjectID, &branch, &firstSeenMillis, &item.TotalTokens, &costMicros); err != nil {
		return item, fmt.Errorf("scan primary workspace: %w", err)
	}
	item.ProjectName = item.ProjectID
	item.Branch = nullStringPtr(branch)
	item.CreatedAt = time.UnixMilli(firstSeenMillis).UTC().Format(time.RFC3339)
	item.TotalCostUSD = microsToUSD(costMicros)
	return item, nil
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func formatSQLiteTime(value time.Time) string {
	return value.UTC().Format(sqliteDateTimeLayout)
}

func parseSQLiteTime(value string) time.Time {
	parsed, err := time.Parse(sqliteDateTimeLayout, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}

// formatAPITime renders a parsed SQLite UTC timestamp as RFC 3339, keeping the
// raw text when it did not parse.
func formatAPITime(parsed time.Time, raw string) string {
	if parsed.IsZero() {
		return raw
	}
	return parsed.Format(time.RFC3339)
}

func roundTenth(value float64) float64 {
	return math.Round(value*10) / 10
}
