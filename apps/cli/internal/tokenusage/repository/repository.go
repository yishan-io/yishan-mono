// Package repository owns token-usage persistence: the hourly-row repository
// interface and the conversion between the normalized usage records scanners
// produce and the SQLite row shape. Scanners never touch the database.
package repository

import (
	"context"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/tokenusage/record"
)

// HourlyUsageRepository is the durable storage the collector needs: replace an
// agent's hourly rows, list dirty rows for sync, mark rows synced, and read
// the sync state. The SQLite implementation lives in internal/db.
type HourlyUsageRepository interface {
	ReplaceAgentHourlyRows(ctx context.Context, agentKind string, rows []localdb.HourlyUsageRow) error
	ListDirtyHourlyRows(ctx context.Context) ([]localdb.HourlyUsageRow, error)
	MarkHourlyRowsSynced(ctx context.Context, rows []localdb.HourlyUsageRow, syncedAt int64) error
	GetHourlyUsageSyncState(ctx context.Context) (localdb.HourlyUsageSyncState, error)
}

// ToHourlyRows converts normalized scanner records into SQLite row shape for
// persistence.
func ToHourlyRows(records []record.UsageRecord) []localdb.HourlyUsageRow {
	rows := make([]localdb.HourlyUsageRow, 0, len(records))
	for _, r := range records {
		rows = append(rows, localdb.HourlyUsageRow{
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
			CostSource:            localdb.CostSource(r.CostSource),
			EventCount:            r.EventCount,
			SessionCount:          r.SessionCount,
			TurnCount:             r.TurnCount,
			ToolCallCount:         r.ToolCallCount,
			AttributionConfidence: localdb.AttributionConfidence(r.AttributionConfidence),
			ScannerSourceKind:     localdb.ScannerSourceKind(r.ScannerSourceKind),
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
