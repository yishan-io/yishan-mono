package db

import (
	"context"
	"database/sql"
	"time"

	"github.com/rs/zerolog/log"
)

const migrationUsageAPICompletedKey = "migration_usage_api_completed"

// MigrateUsageFromAPI pulls historical hourly usage from the remote API and imports it
// into the local token_usage_hourly table. It is idempotent — once the marker is set,
// subsequent calls return immediately.
func MigrateUsageFromAPI(ctx context.Context, database *sql.DB, organizations []string, client APIClient) error {
	if !client.IsConfigured() {
		return nil
	}
	alreadyMigrated, err := MetadataKeyExists(ctx, database, migrationUsageAPICompletedKey)
	if err != nil {
		return err
	}
	if alreadyMigrated {
		return nil
	}
	if len(organizations) == 0 {
		return nil
	}

	store := NewHourlyUsageStore(database)
	anySucceeded := false
	for _, orgID := range organizations {
		log.Info().Str("orgId", orgID).Msg("migrating token usage from API")
		if err := migrateOrgUsage(ctx, store, client, orgID); err != nil {
			log.Warn().Err(err).Str("orgId", orgID).Msg("usage API migration failed for org")
			continue
		}
		anySucceeded = true
	}

	if !anySucceeded && len(organizations) > 0 {
		log.Warn().Msg("usage API migration: all organizations failed; marker not set, will retry on next restart")
		return nil
	}

	return setMetadataKey(ctx, database, migrationUsageAPICompletedKey, "true")
}

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

	if err := store.UpsertHourlyUsageRows(ctx, localRows); err != nil {
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
