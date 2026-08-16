// Package repository owns token-usage persistence: the hourly-row repository
// interface and the conversion between the normalized usage records scanners
// produce and the SQLite row shape. Scanners never touch the database.
package repository

import (
	"context"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/tokenusage/record"
)

// HourlyUsageRepository is the durable storage the collector needs: replace an
// agent's hourly rows, list dirty rows for sync, mark rows synced, and read
// the sync state. The SQLite implementation lives in internal/db.
type HourlyUsageRepository interface {
	ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []sqlite.HourlyUsageRow) error
	ListDirtyHourlyRows(ctx context.Context) ([]sqlite.HourlyUsageRow, error)
	MarkHourlyRowsSynced(ctx context.Context, rows []sqlite.HourlyUsageRow, syncedAt int64) error
	GetHourlyUsageSyncState(ctx context.Context) (sqlite.HourlyUsageSyncState, error)
}

// ToHourlyRows converts normalized scanner records into SQLite row shape for
// persistence.
func ToHourlyRows(records []record.UsageRecord) []sqlite.HourlyUsageRow {
	rows := make([]sqlite.HourlyUsageRow, 0, len(records))
	for _, r := range records {
		rows = append(rows, sqlite.HourlyUsageRow{
			ProjectID:             r.ProjectID,
			WorkspaceID:           r.WorkspaceID,
			WorkspacePath:         r.WorkspacePath,
			OrganizationID:        r.OrganizationID,
			AgentKind:             r.AgentKind,
			Model:                 r.Model,
			ModelNormalized:       r.ModelNormalized,
			BucketStartHourUTC:    r.BucketStartHourUTC,
			InputTokens:           r.InputTokens,
			OutputTokens:          r.OutputTokens,
			CachedInputTokens:     r.CachedInputTokens,
			CachedWriteTokens:     r.CachedWriteTokens,
			ReasoningTokens:       r.ReasoningTokens,
			TotalTokens:           r.TotalTokens,
			TotalCostMicrosUSD:    r.TotalCostMicrosUSD,
			CostSource:            sqlite.CostSource(r.CostSource),
			EventCount:            r.EventCount,
			SessionCount:          r.SessionCount,
			TurnCount:             r.TurnCount,
			ToolCallCount:         r.ToolCallCount,
			AttributionConfidence: sqlite.AttributionConfidence(r.AttributionConfidence),
			ScannerSourceKind:     sqlite.ScannerSourceKind(r.ScannerSourceKind),
			ScannerSourceID:       r.ScannerSourceID,
			IngestedAt:            r.IngestedAt,
			RunID:                 r.RunID,
			UpdatedAt:             r.UpdatedAt,
			Dirty:                 r.Dirty,
			LastSyncedAt:          r.LastSyncedAt,
		})
	}
	return rows
}
