package sqlite

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

var overviewTestNow = time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)

type usageSeed struct {
	project, workspace, path, org, agent, model string
	at                                          time.Time
	total, input, output, cached, cachedWrite   int64
	turns, tools, costMicros                    int64
}

func insertUsage(t *testing.T, database *sql.DB, seed usageSeed) {
	t.Helper()
	_, err := database.Exec(`INSERT INTO token_usage_hourly (project_id, workspace_id, workspace_path, organization_id,
		agent_kind, model, model_normalized, bucket_start_hour_utc, input_tokens, output_tokens, cached_input_tokens,
		cached_write_tokens, reasoning_tokens, total_tokens, event_count, session_count, turn_count, tool_call_count,
		attribution_confidence, scanner_source_kind, scanner_source_id, ingested_at, run_id, updated_at, total_cost_micros_usd)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, ?, ?, 'exact', 'test', 'test', 0, 'run', 0, ?)`,
		seed.project, seed.workspace, seed.path, seed.org, seed.agent, seed.model, seed.model,
		seed.at.Truncate(time.Hour).UnixMilli(), seed.input, seed.output, seed.cached, seed.cachedWrite,
		seed.total, seed.turns, seed.tools, seed.costMicros)
	if err != nil {
		t.Fatalf("insert usage: %v", err)
	}
}

type workspaceSeed struct {
	id, org, project, kind, status, path string
	branch                               any
	created, updated                     time.Time
}

func insertWorkspace(t *testing.T, database *sql.DB, seed workspaceSeed) {
	t.Helper()
	var project any
	if seed.project != "" {
		project = seed.project
	}
	_, err := database.Exec(`INSERT INTO workspaces (id, organization_id, project_id, node_id, kind, status, branch,
		local_path, created_at, updated_at) VALUES (?, ?, ?, 'node-1', ?, ?, ?, ?, ?, ?)`,
		seed.id, seed.org, project, seed.kind, seed.status, seed.branch, seed.path,
		formatSQLiteTime(seed.created), formatSQLiteTime(seed.updated))
	if err != nil {
		t.Fatalf("insert workspace %s: %v", seed.id, err)
	}
}

func overviewFilter(days int) OverviewFilter {
	return OverviewFilter{Since: overviewTestNow.AddDate(0, 0, -days), Until: overviewTestNow}
}

func TestOverviewStore_EmptyDatabaseReturnsEmptyCollections(t *testing.T) {
	store := NewOverviewStore(openTestDB(t).database)
	ctx := context.Background()
	usage, err := store.GetTokenUsageSeries(ctx, overviewFilter(7), OverviewGranularityDay)
	if err != nil || usage.Series == nil || len(usage.Series) != 0 || usage.GrandTotal != 0 {
		t.Fatalf("usage = %+v, %v", usage, err)
	}
	models, err := store.GetModelBreakdown(ctx, overviewFilter(7))
	if err != nil || models.Models == nil || len(models.Models) != 0 {
		t.Fatalf("models = %+v, %v", models, err)
	}
	insights, err := store.GetWorkspaceInsights(ctx, overviewFilter(7))
	if err != nil || insights.LastClosedWorkspaces == nil || insights.TopPrimaryWorkspaces == nil ||
		insights.AverageLifetimeHours != nil || insights.ClosedWorkspaceCount != 0 {
		t.Fatalf("insights = %+v, %v", insights, err)
	}
}

func TestOverviewStore_TokenUsageSeriesBucketsAndTotals(t *testing.T) {
	database := openTestDB(t).database
	day := overviewTestNow.Add(-24 * time.Hour).Truncate(24 * time.Hour)
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", org: "o1", agent: "claude", model: "opus",
		at: day.Add(2 * time.Hour), total: 100, input: 40, output: 30, cached: 20, cachedWrite: 10, turns: 2, tools: 3, costMicros: 1_500_000})
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", org: "o1", agent: "codex", model: "gpt",
		at: day.Add(5 * time.Hour), total: 50, input: 50, turns: 1, costMicros: 500_000})
	insertUsage(t, database, usageSeed{project: "p2", workspace: "w2", org: "o2", agent: "claude", model: "opus",
		at: day.Add(5 * time.Hour), total: 7, input: 7})
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", org: "o1", agent: "claude", model: "opus",
		at: overviewTestNow.AddDate(0, 0, -10), total: 1000})
	store := NewOverviewStore(database)

	hourly, err := store.GetTokenUsageSeries(context.Background(), overviewFilter(7), OverviewGranularityHour)
	if err != nil || len(hourly.Series) != 2 || hourly.GrandTotal != 157 {
		t.Fatalf("hourly = %+v, %v", hourly, err)
	}
	if hourly.Series[0].BucketStartUtc != day.Add(2*time.Hour).Format(time.RFC3339) {
		t.Fatalf("first bucket = %s", hourly.Series[0].BucketStartUtc)
	}

	filter := overviewFilter(7)
	filter.ProjectID, filter.OrganizationID = "p1", "o1"
	daily, err := store.GetTokenUsageSeries(context.Background(), filter, OverviewGranularityDay)
	if err != nil || len(daily.Series) != 1 {
		t.Fatalf("daily = %+v, %v", daily, err)
	}
	got := daily
	if got.Series[0].BucketStartUtc != day.Format(time.RFC3339) || got.GrandTotal != 150 || got.CachedTotal != 20 ||
		got.CachedWriteTotal != 10 || got.UncachedTotal != 120 || got.TurnTotal != 3 || got.ToolCallTotal != 3 ||
		got.TotalCostUSD != 2 || got.Series[0].TotalCostUSD != 2 {
		t.Fatalf("daily totals = %+v", got)
	}
}

func TestOverviewStore_ModelBreakdownPercentagesAndOrder(t *testing.T) {
	database := openTestDB(t).database
	at := overviewTestNow.Add(-time.Hour)
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", agent: "claude", model: "opus", at: at, total: 200, input: 150, output: 50, costMicros: 3_000_000})
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", agent: "codex", model: "gpt", at: at, total: 100, input: 100})
	insertUsage(t, database, usageSeed{project: "p1", workspace: "w1", agent: "claude", model: "opus", at: at.Add(-time.Hour), total: 33})

	result, err := NewOverviewStore(database).GetModelBreakdown(context.Background(), overviewFilter(7))
	if err != nil || len(result.Models) != 2 {
		t.Fatalf("models = %+v, %v", result, err)
	}
	first, second := result.Models[0], result.Models[1]
	if first.ModelNormalized != "opus" || first.TotalTokens != 233 || first.Percentage != 69.97 || first.TotalCostUSD != 3 {
		t.Fatalf("first = %+v", first)
	}
	if second.AgentKind != "codex" || second.Percentage != 30.03 {
		t.Fatalf("second = %+v", second)
	}
}

func TestOverviewStore_ClosedWorkspaceInsightsAreRangeBounded(t *testing.T) {
	database := openTestDB(t).database
	insertWorkspace(t, database, workspaceSeed{id: "c1", org: "o1", project: "p1", kind: "worktree", status: "closed", branch: "feat",
		created: overviewTestNow.Add(-50 * time.Hour), updated: overviewTestNow.Add(-2 * time.Hour)})
	insertWorkspace(t, database, workspaceSeed{id: "c2", org: "o1", project: "p1", kind: "worktree", status: "closed",
		created: overviewTestNow.Add(-5 * time.Hour), updated: overviewTestNow.Add(-1 * time.Hour)})
	insertWorkspace(t, database, workspaceSeed{id: "old", org: "o1", project: "p1", kind: "worktree", status: "closed",
		created: overviewTestNow.AddDate(0, 0, -20), updated: overviewTestNow.AddDate(0, 0, -10)})
	insertWorkspace(t, database, workspaceSeed{id: "live", org: "o1", project: "p1", kind: "worktree", status: "active",
		created: overviewTestNow.Add(-5 * time.Hour), updated: overviewTestNow.Add(-1 * time.Hour)})
	insertUsage(t, database, usageSeed{project: "p1", workspace: "c1", agent: "claude", model: "opus",
		at: overviewTestNow.AddDate(0, 0, -30), total: 400, costMicros: 250_000})

	result, err := NewOverviewStore(database).GetWorkspaceInsights(context.Background(), overviewFilter(7))
	if err != nil || result.ClosedWorkspaceCount != 2 || result.AverageLifetimeHours == nil || *result.AverageLifetimeHours != 26 {
		t.Fatalf("closed summary = %+v, %v", result, err)
	}
	if len(result.LastClosedWorkspaces) != 2 || result.LastClosedWorkspaces[0].ID != "c2" {
		t.Fatalf("closed list = %+v", result.LastClosedWorkspaces)
	}
	c1 := result.LastClosedWorkspaces[1]
	if c1.LifetimeHours != 48 || c1.TotalTokens != 400 || c1.TotalCostUSD != 0.25 || c1.Branch == nil || *c1.Branch != "feat" ||
		c1.ProjectName != "p1" || c1.ClosedAt != overviewTestNow.Add(-2*time.Hour).Format(time.RFC3339) {
		t.Fatalf("c1 = %+v", c1)
	}
	if result.LastClosedWorkspaces[0].Branch != nil {
		t.Fatalf("c2 branch = %v", *result.LastClosedWorkspaces[0].Branch)
	}
}

func TestOverviewStore_PrimaryWorkspacesDerivedFromUsage(t *testing.T) {
	database := openTestDB(t).database
	hourAgo := overviewTestNow.Add(-time.Hour)
	// Remote-only primaries (no local row); "a-old" and "a-new" share a path.
	insertUsage(t, database, usageSeed{project: "pa", workspace: "a-old", path: "/a", org: "o1", agent: "claude", model: "opus",
		at: overviewTestNow.AddDate(0, 0, -3), total: 10})
	insertUsage(t, database, usageSeed{project: "pa", workspace: "a-new", path: "/a", org: "o1", agent: "claude", model: "opus",
		at: hourAgo, total: 15})
	insertUsage(t, database, usageSeed{project: "pb", workspace: "b", path: "/b", org: "o1", agent: "claude", model: "opus",
		at: hourAgo, total: 90, costMicros: 1_000_000})
	// A local primary row contributes its branch.
	insertWorkspace(t, database, workspaceSeed{id: "b", org: "o1", project: "pb", kind: "primary", status: "active", path: "/b",
		branch: "main", created: overviewTestNow, updated: overviewTestNow})
	// Excluded: local worktree/folder rows, unattributed usage, other org, out of range.
	insertWorkspace(t, database, workspaceSeed{id: "wt", org: "o1", project: "pa", kind: "worktree", status: "active", path: "/a-wt",
		created: overviewTestNow, updated: overviewTestNow})
	insertWorkspace(t, database, workspaceSeed{id: "folder", org: "o1", kind: "folder", status: "active", path: "/f",
		created: overviewTestNow, updated: overviewTestNow})
	for _, seed := range []usageSeed{
		{project: "pa", workspace: "wt", path: "/a-wt", org: "o1", at: hourAgo, total: 1000},
		{project: "unknown", workspace: "folder", path: "/f", org: "o1", at: hourAgo, total: 1000},
		{project: "pc", workspace: "c", path: "/c", org: "o2", at: hourAgo, total: 1000},
		{project: "pd", workspace: "d", path: "/d", org: "o1", at: overviewTestNow.AddDate(0, 0, -20), total: 1000},
	} {
		seed.agent, seed.model = "claude", "opus"
		insertUsage(t, database, seed)
	}

	filter := overviewFilter(7)
	filter.OrganizationID = "o1"
	result, err := NewOverviewStore(database).GetWorkspaceInsights(context.Background(), filter)
	if err != nil || result.PrimaryWorkspaceCount != 2 || result.PrimaryWorkspaceTokens != 115 {
		t.Fatalf("primary summary = %+v, %v", result, err)
	}
	top := result.TopPrimaryWorkspaces
	if len(top) != 2 || top[0].ID != "b" || top[0].TotalCostUSD != 1 || top[0].Branch == nil || *top[0].Branch != "main" {
		t.Fatalf("top[0] = %+v", top)
	}
	a := top[1]
	if a.ID != "a-new" || a.ProjectID != "pa" || a.TotalTokens != 25 || a.Branch != nil ||
		a.CreatedAt != overviewTestNow.AddDate(0, 0, -3).Truncate(time.Hour).Format(time.RFC3339) {
		t.Fatalf("top[1] = %+v", a)
	}
}

func TestOverviewStore_PrimaryWorkspacesTieBreakByID(t *testing.T) {
	database := openTestDB(t).database
	for _, id := range []string{"z", "m", "a"} {
		insertUsage(t, database, usageSeed{project: "p-" + id, workspace: id, path: "/" + id, agent: "claude", model: "opus",
			at: overviewTestNow.Add(-time.Hour), total: 5})
	}
	result, err := NewOverviewStore(database).GetWorkspaceInsights(context.Background(), overviewFilter(7))
	if err != nil || len(result.TopPrimaryWorkspaces) != 3 {
		t.Fatalf("result = %+v, %v", result, err)
	}
	for i, want := range []string{"a", "m", "z"} {
		if result.TopPrimaryWorkspaces[i].ID != want {
			t.Fatalf("order = %+v", result.TopPrimaryWorkspaces)
		}
	}
}
