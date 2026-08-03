package db

import (
	"context"
	"math"
	"testing"
	"time"
)

func TestOverviewStoreGetTokenUsageSeries_AccountsForCachedWriteTokens(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	ctx := context.Background()
	hourlyUsageStore := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	row := newOverviewUsageRow(bucketStart, "workspace-1", "gpt-5.6-terra", 1_350, 250_000)
	row.InputTokens = 1_000
	row.CachedInputTokens = 100
	row.CachedWriteTokens = 200
	row.OutputTokens = 50
	if err := hourlyUsageStore.UpsertHourlyUsageRows(ctx, []HourlyUsageRow{row}); err != nil {
		t.Fatalf("upsert hourly usage: %v", err)
	}

	result, err := NewOverviewStore(database).GetTokenUsageSeries(ctx, 7, "", "hour")
	if err != nil {
		t.Fatalf("get token usage series: %v", err)
	}
	if result.CachedTotal != 100 {
		t.Fatalf("expected cached total 100, got %d", result.CachedTotal)
	}
	if result.CachedWriteTotal != 200 {
		t.Fatalf("expected cached write total 200, got %d", result.CachedWriteTotal)
	}
	if result.UncachedTotal != 1_050 {
		t.Fatalf("expected uncached total 1050, got %d", result.UncachedTotal)
	}
}

func TestOverviewStoreGetTokenUsageSeries_IncludesCostTotals(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	ctx := context.Background()
	hourlyUsageStore := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	if err := hourlyUsageStore.UpsertHourlyUsageRows(ctx, []HourlyUsageRow{
		newOverviewUsageRow(bucketStart, "workspace-1", "gpt-5.6-terra", 1_350, 250_000),
		newOverviewUsageRow(bucketStart, "workspace-2", "claude-opus-4-6", 650, 500_000),
	}); err != nil {
		t.Fatalf("upsert hourly usage: %v", err)
	}

	result, err := NewOverviewStore(database).GetTokenUsageSeries(ctx, 7, "", "hour")
	if err != nil {
		t.Fatalf("get token usage series: %v", err)
	}
	if len(result.Series) != 1 {
		t.Fatalf("expected 1 series bucket, got %d", len(result.Series))
	}
	if result.GrandTotal != 2_000 {
		t.Fatalf("expected grand total 2000, got %d", result.GrandTotal)
	}
	if math.Abs(result.TotalCostUSD-0.75) > 0.000001 {
		t.Fatalf("expected total cost 0.75, got %f", result.TotalCostUSD)
	}
	if math.Abs(result.Series[0].TotalCostUSD-0.75) > 0.000001 {
		t.Fatalf("expected bucket cost 0.75, got %f", result.Series[0].TotalCostUSD)
	}
}

func TestOverviewStoreGetModelBreakdown_IncludesCostTotals(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	ctx := context.Background()
	hourlyUsageStore := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	if err := hourlyUsageStore.UpsertHourlyUsageRows(ctx, []HourlyUsageRow{
		newOverviewUsageRow(bucketStart, "workspace-1", "gpt-5.6-terra", 1_350, 250_000),
		newOverviewUsageRow(bucketStart, "workspace-2", "claude-opus-4-6", 650, 500_000),
	}); err != nil {
		t.Fatalf("upsert hourly usage: %v", err)
	}

	result, err := NewOverviewStore(database).GetModelBreakdown(ctx, 7, "")
	if err != nil {
		t.Fatalf("get model breakdown: %v", err)
	}
	if len(result.Models) != 2 {
		t.Fatalf("expected 2 model rows, got %d", len(result.Models))
	}
	if result.Models[0].ModelNormalized != "gpt-5.6-terra" {
		t.Fatalf("expected top model gpt-5.6-terra, got %q", result.Models[0].ModelNormalized)
	}
	if math.Abs(result.Models[0].TotalCostUSD-0.25) > 0.000001 {
		t.Fatalf("expected top model cost 0.25, got %f", result.Models[0].TotalCostUSD)
	}
	if math.Abs(result.Models[1].TotalCostUSD-0.50) > 0.000001 {
		t.Fatalf("expected second model cost 0.50, got %f", result.Models[1].TotalCostUSD)
	}
}

func TestOverviewStoreGetWorkspaceInsights_IncludesPrimaryWorkspaceCost(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	ctx := context.Background()
	projectStore := NewProjectStore(database)
	if err := projectStore.Create(ctx, &Project{ID: "project-1", Name: "Core", OrganizationID: "org-1", ContextEnabled: true}); err != nil {
		t.Fatalf("create project: %v", err)
	}
	workspaceStore := NewWorkspaceStore(database)
	branch := "main"
	if err := workspaceStore.Create(ctx, &Workspace{
		ID:             "workspace-primary-1",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		NodeID:         "node-1",
		Kind:           "primary",
		Status:         "active",
		Branch:         &branch,
		LocalPath:      "/tmp/core-main",
		State:          "active",
	}); err != nil {
		t.Fatalf("create primary workspace: %v", err)
	}

	hourlyUsageStore := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	if err := hourlyUsageStore.UpsertHourlyUsageRows(ctx, []HourlyUsageRow{{
		ProjectID:             "project-1",
		WorkspaceID:           "workspace-primary-1",
		WorkspacePath:         "/tmp/core-main",
		OrganizationID:        "org-1",
		AgentKind:             "pi",
		Model:                 "gpt-5.6-terra",
		ModelNormalized:       "gpt-5.6-terra",
		BucketStartHourUTC:    bucketStart,
		InputTokens:           1_000,
		OutputTokens:          250,
		CachedInputTokens:     100,
		CachedWriteTokens:     0,
		ReasoningTokens:       0,
		TotalTokens:           1_350,
		TotalCostMicrosUSD:    250_000,
		EventCount:            1,
		SessionCount:          1,
		TurnCount:             1,
		ToolCallCount:         0,
		AttributionConfidence: "exact",
		ScannerSourceKind:     "jsonl",
		ScannerSourceID:       "/tmp/session.jsonl",
		IngestedAt:            bucketStart,
		RunID:                 "scan-1",
		UpdatedAt:             bucketStart,
	}}); err != nil {
		t.Fatalf("upsert hourly usage: %v", err)
	}

	insights, err := NewOverviewStore(database).GetWorkspaceInsights(ctx, 7, "")
	if err != nil {
		t.Fatalf("get workspace insights: %v", err)
	}
	if insights.PrimaryWorkspaceCount != 1 {
		t.Fatalf("expected 1 primary workspace, got %d", insights.PrimaryWorkspaceCount)
	}
	if len(insights.TopPrimaryWorkspaces) != 1 {
		t.Fatalf("expected 1 primary workspace item, got %d", len(insights.TopPrimaryWorkspaces))
	}
	primaryWorkspace := insights.TopPrimaryWorkspaces[0]
	if primaryWorkspace.TotalTokens != 1_350 {
		t.Fatalf("expected 1350 tokens, got %d", primaryWorkspace.TotalTokens)
	}
	if math.Abs(primaryWorkspace.TotalCostUSD-0.25) > 0.000001 {
		t.Fatalf("expected cost 0.25, got %f", primaryWorkspace.TotalCostUSD)
	}
}

func TestOverviewStoreGetWorkspaceInsights_IncludesClosedWorkspaceCost(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	ctx := context.Background()
	projectStore := NewProjectStore(database)
	if err := projectStore.Create(ctx, &Project{ID: "project-1", Name: "Core", OrganizationID: "org-1", ContextEnabled: true}); err != nil {
		t.Fatalf("create project: %v", err)
	}
	workspaceStore := NewWorkspaceStore(database)
	branch := "feature/cost"
	if err := workspaceStore.Create(ctx, &Workspace{
		ID:             "workspace-1",
		OrganizationID: "org-1",
		ProjectID:      "project-1",
		NodeID:         "node-1",
		Kind:           "worktree",
		Status:         "active",
		Branch:         &branch,
		LocalPath:      "/tmp/core-feature-cost",
		State:          "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	closedStatus := "closed"
	if err := workspaceStore.Update(ctx, "workspace-1", WorkspaceUpdate{Status: &closedStatus}); err != nil {
		t.Fatalf("close workspace: %v", err)
	}

	hourlyUsageStore := NewHourlyUsageStore(database)
	bucketStart := time.Now().UTC().Add(-time.Hour).Truncate(time.Hour).UnixMilli()
	if err := hourlyUsageStore.UpsertHourlyUsageRows(ctx, []HourlyUsageRow{newOverviewUsageRow(bucketStart, "workspace-1", "gpt-5.6-terra", 1_350, 250_000)}); err != nil {
		t.Fatalf("upsert hourly usage: %v", err)
	}

	insights, err := NewOverviewStore(database).GetWorkspaceInsights(ctx, 7, "")
	if err != nil {
		t.Fatalf("get workspace insights: %v", err)
	}
	if insights.ClosedWorkspaceCount != 1 {
		t.Fatalf("expected 1 closed workspace, got %d", insights.ClosedWorkspaceCount)
	}
	if len(insights.LastClosedWorkspaces) != 1 {
		t.Fatalf("expected 1 closed workspace item, got %d", len(insights.LastClosedWorkspaces))
	}
	closedWorkspace := insights.LastClosedWorkspaces[0]
	if closedWorkspace.TotalTokens != 1_350 {
		t.Fatalf("expected 1350 tokens, got %d", closedWorkspace.TotalTokens)
	}
	if math.Abs(closedWorkspace.TotalCostUSD-0.25) > 0.000001 {
		t.Fatalf("expected cost 0.25, got %f", closedWorkspace.TotalCostUSD)
	}
}

func newOverviewUsageRow(bucketStart int64, workspaceID string, model string, totalTokens int64, totalCostMicrosUSD int64) HourlyUsageRow {
	return HourlyUsageRow{
		ProjectID:             "project-1",
		WorkspaceID:           workspaceID,
		WorkspacePath:         "/tmp/" + workspaceID,
		OrganizationID:        "org-1",
		AgentKind:             "pi",
		Model:                 model,
		ModelNormalized:       model,
		BucketStartHourUTC:    bucketStart,
		InputTokens:           totalTokens,
		OutputTokens:          0,
		CachedInputTokens:     0,
		CachedWriteTokens:     0,
		ReasoningTokens:       0,
		TotalTokens:           totalTokens,
		TotalCostMicrosUSD:    totalCostMicrosUSD,
		EventCount:            1,
		SessionCount:          1,
		TurnCount:             1,
		ToolCallCount:         0,
		AttributionConfidence: "exact",
		ScannerSourceKind:     "jsonl",
		ScannerSourceID:       "/tmp/session.jsonl",
		IngestedAt:            bucketStart,
		RunID:                 "scan-1",
		UpdatedAt:             bucketStart,
	}
}
