package db

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"
)

func migrateOrgUsage(ctx context.Context, store *HourlyUsageStore, client APIClient, orgID string) error {
	apiRows, err := client.ExportHourlyUsage(ctx, orgID)
	if err != nil {
		return err
	}

	localRows := make([]HourlyUsageRow, 0, len(apiRows))
	for _, apiRow := range apiRows {
		bucketMillis := parseTimestampMillis(apiRow.BucketStartHourUTC)
		ingestedMillis := parseTimestampMillis(apiRow.IngestedAt)
		localRows = append(localRows, HourlyUsageRow{
			ProjectID:             apiRow.ProjectID,
			WorkspaceID:           apiRow.WorkspaceID,
			WorkspacePath:         apiRow.WorkspacePath,
			OrganizationID:        apiRow.OrganizationID,
			AgentKind:             apiRow.AgentKind,
			Model:                 apiRow.Model,
			ModelNormalized:       apiRow.ModelNormalized,
			BucketStartHourUTC:    bucketMillis,
			InputTokens:           apiRow.InputTokens,
			OutputTokens:          apiRow.OutputTokens,
			CachedInputTokens:     apiRow.CachedInputTokens,
			CachedWriteTokens:     apiRow.CachedWriteTokens,
			ReasoningTokens:       apiRow.ReasoningTokens,
			TotalTokens:           apiRow.TotalTokens,
			TotalCostMicrosUSD:    apiRow.TotalCostMicrosUSD,
			CostSource:            CostSource(apiRow.CostSource),
			EventCount:            apiRow.EventCount,
			SessionCount:          apiRow.SessionCount,
			TurnCount:             apiRow.TurnCount,
			ToolCallCount:         apiRow.ToolCallCount,
			AttributionConfidence: AttributionConfidence(apiRow.AttributionConfidence),
			IngestedAt:            ingestedMillis,
			RunID:                 apiRow.RunID,
			Dirty:                 false,
		})
	}

	if err := store.ImportRemoteHourlyUsageRows(ctx, localRows); err != nil {
		return err
	}

	log.Info().Str("orgId", orgID).Int("rows", len(localRows)).Msg("usage migration completed for org")
	return nil
}

func parseTimestampMillis(ts string) int64 {
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err == nil {
		return t.UnixMilli()
	}
	t, err = time.Parse(time.RFC3339, ts)
	if err == nil {
		return t.UnixMilli()
	}
	return 0
}
