package collection

import (
	"context"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/tokenusage/attribution"
	"yishan/apps/cli/internal/tokenusage/record"
)

const tokenUsageSyncChunk = 100

// syncPending pushes dirty hourly rows to the cloud API for every org that
// has pending rows. Rows are marked synced only after their org's upload
// succeeds, so a partial org failure leaves the failed org dirty for the next
// sync.
func (c *Collector) syncPending(source string) {
	if c.runtime == nil || !c.runtime.APIConfigured() {
		return
	}
	syncState, err := c.repo.GetHourlyUsageSyncState(context.Background())
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("token usage sync state read failed")
		return
	}
	if syncState.DirtyRows == 0 {
		return
	}

	log.Debug().
		Str("source", source).
		Int("dirtyRows", syncState.DirtyRows).
		Int("totalRows", syncState.TotalRows).
		Str("lastSuccessfulSyncAt", formatTokenUsageSyncTime(syncState.LastSuccessfulSyncAt)).
		Msg("token usage sync starting")

	pendingByOrg, err := c.snapshotDirtyRowsByOrg()
	if err != nil {
		log.Warn().Err(err).Str("source", source).Msg("token usage dirty rows read failed")
		return
	}
	for orgID, rows := range pendingByOrg {
		if orgID == "" || strings.EqualFold(orgID, "unknown") {
			continue
		}
		if len(rows) == 0 {
			continue
		}
		syncedAt := time.Now().UnixMilli()
		if err := c.syncRowsForOrg(orgID, rows); err != nil {
			log.Warn().Err(err).
				Str("orgId", orgID).
				Str("source", source).
				Int("rows", len(rows)).
				Str("oldestBucket", formatTokenUsageSyncTime(rows[0].BucketStartHourUTC)).
				Str("newestBucket", formatTokenUsageSyncTime(rows[len(rows)-1].BucketStartHourUTC)).
				Msg("token usage sync failed")
			continue
		}
		if err := c.repo.MarkHourlyRowsSynced(context.Background(), rows, syncedAt); err != nil {
			log.Warn().Err(err).
				Str("orgId", orgID).
				Str("source", source).
				Int("rows", len(rows)).
				Msg("token usage sync mark-clean failed")
			continue
		}
		log.Debug().
			Str("orgId", orgID).
			Str("source", source).
			Int("rows", len(rows)).
			Str("oldestBucket", formatTokenUsageSyncTime(rows[0].BucketStartHourUTC)).
			Str("newestBucket", formatTokenUsageSyncTime(rows[len(rows)-1].BucketStartHourUTC)).
			Str("syncedAt", formatTokenUsageSyncTime(syncedAt)).
			Msg("token usage sync completed")
	}
}

func (c *Collector) snapshotDirtyRowsByOrg() (map[string][]sqlite.HourlyUsageRow, error) {
	rows, err := c.repo.ListDirtyHourlyRows(context.Background())
	if err != nil {
		return nil, err
	}

	rowsByOrg := make(map[string][]sqlite.HourlyUsageRow)
	for _, row := range rows {
		if strings.TrimSpace(row.WorkspaceID) == "" {
			continue
		}
		orgID := row.OrganizationID
		if orgID == "" {
			orgID = attribution.OrgIDForWorkspace(c.registry, row.WorkspaceID)
		}
		if orgID == "" {
			log.Warn().Str("workspaceId", row.WorkspaceID).Msg("token usage row has no organization attribution; leaving it dirty")
			continue
		}
		rowsByOrg[orgID] = append(rowsByOrg[orgID], row)
	}
	return rowsByOrg, nil
}

func (c *Collector) syncRowsForOrg(orgID string, rows []sqlite.HourlyUsageRow) error {
	rowInputs := make([]cloud.TokenUsageHourlyRowInput, 0, len(rows))
	for _, row := range rows {
		rowInputs = append(rowInputs, cloud.TokenUsageHourlyRowInput{
			ProjectID:             row.ProjectID,
			WorkspaceID:           row.WorkspaceID,
			WorkspacePath:         row.WorkspacePath,
			AgentKind:             row.AgentKind,
			Model:                 row.Model,
			ModelNormalized:       row.ModelNormalized,
			BucketStartHourUTC:    time.UnixMilli(row.BucketStartHourUTC).UTC().Format(time.RFC3339Nano),
			InputTokens:           row.InputTokens,
			OutputTokens:          row.OutputTokens,
			CachedInputTokens:     row.CachedInputTokens,
			CachedWriteTokens:     row.CachedWriteTokens,
			ReasoningTokens:       row.ReasoningTokens,
			TotalTokens:           row.TotalTokens,
			TotalCostMicrosUSD:    row.TotalCostMicrosUSD,
			CostSource:            string(record.NormalizedCostSource(record.CostSource(row.CostSource))),
			EventCount:            row.EventCount,
			SessionCount:          row.SessionCount,
			TurnCount:             row.TurnCount,
			ToolCallCount:         row.ToolCallCount,
			AttributionConfidence: string(row.AttributionConfidence),
			IngestedAt:            time.UnixMilli(row.IngestedAt).UTC().Format(time.RFC3339Nano),
			RunID:                 row.RunID,
		})
	}

	for start := 0; start < len(rowInputs); start += tokenUsageSyncChunk {
		end := start + tokenUsageSyncChunk
		if end > len(rowInputs) {
			end = len(rowInputs)
		}
		if c.runtime == nil {
			return nil
		}
		if _, err := c.runtime.APIClient().UpsertTokenUsageHourly(orgID, rowInputs[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func formatTokenUsageSyncTime(unixMillis int64) string {
	if unixMillis <= 0 {
		return ""
	}
	return time.UnixMilli(unixMillis).UTC().Format(time.RFC3339Nano)
}
