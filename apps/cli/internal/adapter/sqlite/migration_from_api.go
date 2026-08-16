package sqlite

import (
	"context"
	"database/sql"
	"fmt"
)

// legacyRemoteToLocalMarkerKeys are completion markers written by the retired
// remote→local migration schemes (the API-import era and the export-v1 era).
// Current code never reads or writes them; the rows are deleted on every
// database open by cleanupLegacyMetadataKeys.
var legacyRemoteToLocalMarkerKeys = []string{
	"migration_remote_to_local_completed",
	"migration_api_completed",
	"migration_usage_api_completed",
	"migration_projects_api_export_v1_completed",
	"migration_project_config_backfill_v1_completed",
	"migration_usage_api_export_v1_completed",
}

// legacyUsageMetadataKeys are the version-suffixed cost backfill markers and
// the legacy JSON import markers. Current code never reads or writes them;
// rows are deleted on every database open. The active backfill state lives in
// the single token_usage_cost_backfill_started_at / _completed records.
var legacyUsageMetadataKeys = []string{
	"token_usage_cost_backfill_v1_started_at",
	"token_usage_cost_backfill_v1_completed_at",
	"token_usage_cost_backfill_v2_started_at",
	"token_usage_cost_backfill_v2_completed_at",
	"token_usage_cost_backfill_v3_started_at",
	"token_usage_cost_backfill_v3_completed_at",
	"token_usage_cost_backfill_v4_started_at",
	"token_usage_cost_backfill_v4_completed_at",
	"token_usage_json_import_complete",
	"token_usage_json_backup_pending",
}

// MetadataKeyExists reports whether a metadata key is present in the database.
func MetadataKeyExists(ctx context.Context, database *sql.DB, key string) (bool, error) {
	var foundValue string
	err := database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, key).Scan(&foundValue)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func getMetadataKey(ctx context.Context, database *sql.DB, key string) (string, bool, error) {
	var value string
	err := database.QueryRowContext(ctx, `SELECT value FROM _metadata WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

func cleanupLegacyMetadataKeys(database *sql.DB) error {
	for _, key := range append(append([]string{}, legacyRemoteToLocalMarkerKeys...), legacyUsageMetadataKeys...) {
		if _, err := database.Exec(`DELETE FROM _metadata WHERE key = ?`, key); err != nil {
			return fmt.Errorf("clean up legacy metadata key %q: %w", key, err)
		}
	}
	return nil
}

func setMetadataKey(ctx context.Context, database *sql.DB, key, value string) error {
	_, err := database.ExecContext(ctx, `INSERT INTO _metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
