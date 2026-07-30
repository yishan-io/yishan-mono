package tokenusage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
	localdb "yishan/apps/cli/internal/db"
)

const tokenUsageJSONMigrationSuffix = ".migrated"

// MigrateLegacyJSON imports the former JSON repository exactly once and then preserves it as a backup.
func MigrateLegacyJSON(ctx context.Context, database *sql.DB, configPath string) error {
	filePath, err := resolveHourlyUsagePath(configPath)
	if err != nil {
		return fmt.Errorf("resolve legacy token usage path: %w", err)
	}
	isComplete, err := localdb.IsLegacyJSONImportComplete(ctx, database)
	if err != nil {
		return err
	}
	if !isComplete {
		if err := importLegacyJSON(ctx, database, filePath); err != nil {
			return err
		}
	}
	if err := finalizeLegacyJSONBackup(ctx, database, filePath); err != nil {
		log.Warn().Err(err).Str("path", filePath).Msg("token usage JSON backup is pending")
	}
	return nil
}

func importLegacyJSON(ctx context.Context, database *sql.DB, filePath string) error {
	raw, err := os.ReadFile(filePath)
	if os.IsNotExist(err) || len(raw) == 0 {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read legacy token usage file %q: %w", filePath, err)
	}
	var state hourlyUsageFile
	if err := json.Unmarshal(raw, &state); err != nil {
		return fmt.Errorf("parse legacy token usage file %q: %w", filePath, err)
	}
	return localdb.ImportLegacyHourlyUsage(ctx, database, state.Rows, state.LastSuccessfulSyncAt)
}

func finalizeLegacyJSONBackup(ctx context.Context, database *sql.DB, filePath string) error {
	isPending, err := localdb.IsLegacyJSONBackupPending(ctx, database)
	if err != nil || !isPending {
		return err
	}
	if _, statErr := os.Stat(filePath); statErr == nil {
		if err := os.Rename(filePath, filePath+tokenUsageJSONMigrationSuffix); err != nil {
			return fmt.Errorf("rename legacy token usage file: %w", err)
		}
	} else if !os.IsNotExist(statErr) {
		return fmt.Errorf("stat legacy token usage file: %w", statErr)
	}
	return localdb.ClearLegacyJSONBackupPending(ctx, database)
}
